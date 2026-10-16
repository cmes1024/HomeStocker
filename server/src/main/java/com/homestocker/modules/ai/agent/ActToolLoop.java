package com.homestocker.modules.ai.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.modules.ai.app.AiKeyService;
import com.homestocker.modules.ai.app.AssistPromptTexts;
import com.homestocker.modules.ai.app.CapabilityCatalog;
import com.homestocker.modules.ai.infra.DeepSeekClient;
import com.homestocker.modules.ai.infra.DeepSeekClient.ChatResult;
import com.homestocker.modules.ai.infra.DeepSeekClient.ToolCall;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 原生工具循环。读工具马上执行并把结果送回模型；须确认的写入停住；硬拒绝不执行。
 * 最多 {@link ToolSchemas#MAX_STEPS} 轮模型调用。
 */
@Component
public class ActToolLoop {

  private static final Logger log = LoggerFactory.getLogger(ActToolLoop.class);

  public enum Kind {
    ASK,
    CONFIRM,
    SUBSCRIBE,
    DONE
  }

  public record Outcome(
      Kind kind,
      String reply,
      List<Map<String, Object>> ask,
      List<Map<String, Object>> calls,
      List<Map<String, Object>> rows,
      Map<String, Object> report,
      Map<String, Object> present) {

    public Outcome {
      reply = visible(reply);
      ask = visibleAsk(ask);
    }

    public Outcome(
        Kind kind,
        String reply,
        List<Map<String, Object>> ask,
        List<Map<String, Object>> calls,
        List<Map<String, Object>> rows,
        Map<String, Object> report) {
      this(kind, reply, ask, calls, rows, report, null);
    }
  }

  @FunctionalInterface
  public interface Executor {
    Map<String, Object> execute(List<Map<String, Object>> calls);
  }

  private final ActPrompt actPrompt;
  private final ObjectMapper objectMapper;

  public ActToolLoop(ActPrompt actPrompt, ObjectMapper objectMapper) {
    this.actPrompt = actPrompt;
    this.objectMapper = objectMapper;
  }

  public Outcome run(ActContextBuilder.ActContext ctx, ActPrompt.ModelOpts opts, Executor executor)
      throws ActPrompt.ActModelException {
    ArrayNode tools = ToolSchemas.openAiTools(objectMapper, ctx.catalogMap());
    ArrayNode messages = seedMessages(ctx);
    Set<String> seenSearches = new HashSet<>();
    List<Map<String, Object>> allCalls = new ArrayList<>();
    List<Map<String, Object>> rows = new ArrayList<>(ctx.turnRows());
    Map<String, Object> report = null;
    Map<String, Object> present = null;

    for (int step = 0; step < ToolSchemas.MAX_STEPS; step++) {
      if (budgetExhausted(opts)) {
        log.warn("act tool loop hit time budget");
        return stopWithinBudget(allCalls, rows, report, present);
      }
      ChatResult result;
      try {
        result = complete(opts, messages, tools);
      } catch (ActPrompt.ActModelException e) {
        if (wrote(report) || present != null) {
          log.warn("act tool loop kept receipt after model failure: {}", e.getMessage());
          return finishText("", allCalls, rows, report, present);
        }
        if (ErrorCodes.ACT_BUDGET.equals(e.code())) {
          log.warn("act tool loop hit time budget before write");
          return degrade(rows);
        }
        throw e;
      }
      if (result.toolCalls() == null || result.toolCalls().isEmpty()) {
        if (unbackedWriteClaim(result.content(), report) && step < ToolSchemas.MAX_STEPS - 1) {
          log.warn("act tool loop rejected unbacked write claim");
          messages
              .addObject()
              .put("role", "assistant")
              .put("content", result.content() == null ? "" : result.content());
          messages.addObject().put("role", "system").put("content", NO_WRITE_RECEIPT);
          continue;
        }
        if (blankTurn(result.content(), report, present) && step < ToolSchemas.MAX_STEPS - 1) {
          log.warn("act tool loop rejected blank turn");
          messages
              .addObject()
              .put("role", "assistant")
              .put("content", result.content() == null ? "" : result.content());
          messages.addObject().put("role", "system").put("content", BLANK_TURN);
          continue;
        }
        if (blankTurn(result.content(), report, present)) {
          return degrade(rows);
        }
        return finishText(result.content(), allCalls, rows, report, present);
      }
      appendAssistantToolCall(messages, result);
      BatchStep stepResult =
          applyBatch(
              ctx, executor, messages, result.toolCalls(), allCalls, rows, report, present, seenSearches);
      report = stepResult.report();
      present = stepResult.present();
      if (stepResult.outcome() != null) {
        return stepResult.outcome();
      }
    }
    log.warn("act tool loop hit step cap");
    if (wrote(report)) {
      return finishText("", allCalls, rows, report, present);
    }
    if (present != null) {
      return finishText("", allCalls, rows, report, present);
    }
    return degrade(rows);
  }

  private static boolean budgetExhausted(ActPrompt.ModelOpts opts) {
    return opts != null && opts.budget() != null && opts.budget().nextCallMs(opts.timeoutMs()) <= 0;
  }

  /** 时限用尽：已经改过账就交回执，否则请家人再说一次。 */
  private Outcome stopWithinBudget(
      List<Map<String, Object>> allCalls,
      List<Map<String, Object>> rows,
      Map<String, Object> report,
      Map<String, Object> present) {
    if (wrote(report) || present != null) {
      return finishText("", allCalls, rows, report, present);
    }
    return degrade(rows);
  }

  /** 测试可替换模型回复。 */
  ChatResult complete(ActPrompt.ModelOpts opts, ArrayNode messages, ArrayNode tools)
      throws ActPrompt.ActModelException {
    return actPrompt.completeTools(opts, messages, tools);
  }

  private record BatchStep(Outcome outcome, Map<String, Object> report, Map<String, Object> present) {}

  /**
   * 同一批工具里只要有须确认的写入，其它写入也先停住，一起放进确认卡。
   * 提问则本批写入都不执行。只读调用仍然马上执行。
   */
  private BatchStep applyBatch(
      ActContextBuilder.ActContext ctx,
      Executor executor,
      ArrayNode messages,
      List<ToolCall> calls,
      List<Map<String, Object>> allCalls,
      List<Map<String, Object>> rows,
      Map<String, Object> report,
      Map<String, Object> present,
      Set<String> seenSearches) {
    boolean asked = false;
    boolean holdWrites = false;
    String askQuestion = "";
    List<String> askOptions = new ArrayList<>();
    for (ToolCall call : calls) {
      if (ToolSchemas.ASK.equals(call.name())) {
        asked = true;
        Map<String, Object> args = parseArgs(call.arguments());
        askQuestion = str(args.get("question"));
        askOptions = stringList(args.get("options"));
        continue;
      }
      String use = ToolSchemas.capabilityId(call.name());
      Map<String, Object> api = ctx.catalogMap() == null ? null : ctx.catalogMap().get(use);
      if (api != null && Boolean.TRUE.equals(api.get("confirm"))) {
        holdWrites = true;
      }
    }
    List<Map<String, Object>> held = new ArrayList<>();
    for (ToolCall call : calls) {
      if (ToolSchemas.ASK.equals(call.name())) {
        appendToolMessage(messages, call.id(), "已向家人提问，本轮不再改台账。");
        continue;
      }
      if (ToolSchemas.PRESENT.equals(call.name())) {
        Map<String, Object> spec = presentSpec(parseArgs(call.arguments()));
        if (spec == null) {
          appendToolMessage(messages, call.id(), "展示类型只能是 table、stats、bars、pie。");
        } else {
          present = spec;
          appendToolMessage(messages, call.id(), "已记下展示，本轮结束时画给家人。不要自己编数字。");
        }
        continue;
      }
      String use = ToolSchemas.capabilityId(call.name());
      if (use.isBlank()
          || CapabilityCatalog.isHardDenied(use)
          || ctx.catalogMap() == null
          || !ctx.catalogMap().containsKey(use)) {
        appendToolMessage(messages, call.id(), "不能执行" + (use.isBlank() ? "" : "（" + use + "）"));
        continue;
      }
      Map<String, Object> domainCall = new LinkedHashMap<>();
      domainCall.put("use", use);
      domainCall.putAll(parseArgs(call.arguments()));
      domainCall.remove("use");
      domainCall.put("use", use);
      Map<String, Object> api = ctx.catalogMap().get(use);
      boolean confirm = api != null && Boolean.TRUE.equals(api.get("confirm"));
      String blocked =
          PlaceGrounding.ungrounded(
              ctx.userText(),
              PlaceGrounding.habitDefaultSpace(ctx.vars() == null ? "" : ctx.vars().get("habits")),
              ctx.tree(),
              domainCall);
      if (blocked == null) {
        blocked =
            WriteGrounding.blocked(
                ctx.userText(),
                PlaceGrounding.habitDefaultSpace(ctx.vars() == null ? "" : ctx.vars().get("habits")),
                ctx.tree(),
                rows,
                domainCall);
      }
      if (blocked != null) {
        appendToolMessage(messages, call.id(), blocked);
        continue;
      }
      if (confirm || (isMutation(use) && (asked || holdWrites))) {
        if (!asked) {
          held.add(domainCall);
        }
        appendToolMessage(
            messages,
            call.id(),
            asked ? "本轮改为提问，这项先不写入。" : "须家人确认后才执行，本轮先停住。");
        continue;
      }
      Map<String, Object> one = executor.execute(List.of(domainCall));
      report = mergeReports(report, one, ctx.tree());
      List<Map<String, Object>> fresh = ingest(one, ctx);
      rows.addAll(fresh);
      allCalls.add(domainCall);
      String repeated =
          "item.search".equals(use) && !seenSearches.add(searchSignature(domainCall))
              ? "相同条件本轮已经查过，下面仍是那些行。不要再用同一条件查。\n"
              : "";
      appendToolMessage(messages, call.id(), repeated + toolText(one, fresh));
      if (one != null && Boolean.TRUE.equals(one.get("subscribeUi"))) {
        return new BatchStep(
            new Outcome(Kind.SUBSCRIBE, "", List.of(), allCalls, rows, report, present), report, present);
      }
    }
    if (asked) {
      String question = askQuestion.isBlank() ? AssistPromptTexts.DEGRADE_ASK : askQuestion;
      Map<String, Object> ask = new LinkedHashMap<>();
      ask.put("question", question);
      ask.put(
          "options",
          askOptions.stream().map(label -> Map.<String, Object>of("label", label, "value", label)).toList());
      return new BatchStep(
          new Outcome(Kind.ASK, "", List.of(ask), allCalls, rows, report, present), report, present);
    }
    if (!held.isEmpty()) {
      return new BatchStep(
          new Outcome(Kind.CONFIRM, "", List.of(), held, rows, report, present), report, present);
    }
    return new BatchStep(null, report, present);
  }

  /** 会改台账的调用。和只读查询分开，便于和确认卡放在同一批里停住。 */
  static boolean isMutation(String use) {
    return use != null
        && use.matches(
            "item\\.(create|createMany|update|remove|removeMany|merge)|space\\.(create|createMany|createLocation|createLocationMany|remove|removeMany|removeLocation|removeLocationMany)|tag\\.(create|createMany|remove|removeMany)|habit\\.(upsert|remove)");
  }

  private Outcome finishText(
      String content,
      List<Map<String, Object>> allCalls,
      List<Map<String, Object>> rows,
      Map<String, Object> report,
      Map<String, Object> present) {
    String text = content == null ? "" : content.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      log.warn("act tool loop ignored json text");
      if (allCalls.isEmpty() && report == null) {
        return degrade(rows);
      }
      return new Outcome(Kind.DONE, "", List.of(), allCalls, rows, report, present);
    }
    if (unbackedWriteClaim(text, report)) {
      log.warn("act tool loop dropped unbacked write claim");
      return degrade(rows);
    }
    if (text.isEmpty() && (report == null || allCalls.isEmpty())) {
      return degrade(rows);
    }
    return new Outcome(Kind.DONE, text, List.of(), allCalls, rows, report, present);
  }

  private Outcome degrade(List<Map<String, Object>> rows) {
    Map<String, Object> ask = new LinkedHashMap<>();
    ask.put("question", AssistPromptTexts.DEGRADE_ASK);
    ask.put("options", List.of());
    return new Outcome(Kind.ASK, "", List.of(ask), List.of(), rows, null);
  }

  private List<Map<String, Object>> ingest(Map<String, Object> report, ActContextBuilder.ActContext ctx) {
    if (report == null) {
      return List.of();
    }
    List<Map<String, Object>> rows = new ArrayList<>();
    Object exec = report.get("executed");
    if (!(exec instanceof List<?> executed)) {
      return rows;
    }
    int n = ItemsProbe.nextProbeNumber(ctx.refs()) - 1;
    for (Object rowObj : executed) {
      if (!(rowObj instanceof Map<?, ?> row) || !(row.get("inventory") instanceof List<?> inv)) {
        continue;
      }
      for (Object itemObj : inv) {
        if (!(itemObj instanceof Map<?, ?> item)) {
          continue;
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> itemMap = (Map<String, Object>) item;
        String id = str(itemMap.get("_id"));
        if (id.isBlank()) {
          id = str(itemMap.get("itemId"));
        }
        if (id.isBlank() || already(ctx.refs(), id)) {
          continue;
        }
        n++;
        Map<String, Object> compact = ActRefs.compactItem(itemMap, "P" + n, ctx.tree());
        ctx.refs().put("P" + n, compact);
        rows.add(compact);
      }
    }
    return rows;
  }

  private static boolean already(Map<String, Map<String, Object>> refs, String itemId) {
    for (Map<String, Object> row : refs.values()) {
      if (row != null && itemId.equals(str(row.get("itemId")))) {
        return true;
      }
    }
    return false;
  }

  private String toolText(Map<String, Object> report, List<Map<String, Object>> rows) {
    if (report == null) {
      return "没有结果";
    }
    StringBuilder sb = new StringBuilder();
    Object failed = report.get("failed");
    if (failed instanceof List<?> list && !list.isEmpty()) {
      Object first = list.get(0);
      if (first instanceof Map<?, ?> m) {
        sb.append("失败：").append(str(m.get("summary")));
      }
    }
    Object executed = report.get("executed");
    if (executed instanceof List<?> list) {
      for (Object o : list) {
        if (!(o instanceof Map<?, ?> m)) {
          continue;
        }
        if (sb.length() > 0) {
          sb.append('\n');
        }
        sb.append(str(m.get("use"))).append("：").append(str(m.get("summary")));
        if (m.get("knowledge") != null) {
          sb.append('\n').append(clip(str(m.get("knowledge")), 1200));
        }
        if (m.get("pageDoc") != null) {
          sb.append('\n').append(clip(str(m.get("pageDoc")), 800));
        }
      }
    }
    if (!rows.isEmpty()) {
      sb.append("\n行：\n").append(ActPrompt.renderProbeRows(rows));
    }
    String text = sb.toString().trim();
    return text.isEmpty() ? "完成" : clip(text, 2000);
  }

  private ArrayNode seedMessages(ActContextBuilder.ActContext ctx) {
    ArrayNode messages = objectMapper.createArrayNode();
    messages.addObject().put("role", "system").put("content", ctx.system() == null ? "" : ctx.system());
    for (Map<String, String> row :
        ActPrompt.historyForModel(ctx.history(), System.currentTimeMillis())) {
      String role = row.get("role");
      String text = row.get("text");
      if ("system".equals(role)) {
        if (text != null && !text.isBlank()) {
          messages.addObject().put("role", "system").put("content", text);
        }
        continue;
      }
      String content = ShanghaiDates.stampContent(text, row.get("at"));
      if (content == null || content.isBlank()) {
        continue;
      }
      if (!"user".equals(role) && !"assistant".equals(role)) {
        continue;
      }
      messages.addObject().put("role", role).put("content", content);
    }
    messages.addObject().put("role", "user").put("content", ctx.userText() == null ? "" : ctx.userText());
    return messages;
  }

  private void appendAssistantToolCall(ArrayNode messages, ChatResult result) {
    ObjectNode assistant = messages.addObject();
    assistant.put("role", "assistant");
    assistant.put("content", result.content() == null ? "" : result.content());
    ArrayNode calls = assistant.putArray("tool_calls");
    for (ToolCall call : result.toolCalls()) {
      ObjectNode node = calls.addObject();
      node.put("id", call.id());
      node.put("type", "function");
      node.putObject("function").put("name", call.name()).put("arguments", call.arguments() == null ? "{}" : call.arguments());
    }
  }

  private static void appendToolMessage(ArrayNode messages, String toolCallId, String content) {
    messages
        .addObject()
        .put("role", "tool")
        .put("tool_call_id", toolCallId == null ? "" : toolCallId)
        .put("content", content == null ? "" : content);
  }

  private Map<String, Object> parseArgs(String arguments) {
    if (arguments == null || arguments.isBlank()) {
      return new LinkedHashMap<>();
    }
    try {
      Map<String, Object> parsed = objectMapper.readValue(arguments, new TypeReference<>() {});
      return parsed == null ? new LinkedHashMap<>() : new LinkedHashMap<>(parsed);
    } catch (Exception e) {
      return new LinkedHashMap<>();
    }
  }

  private static List<String> stringList(Object raw) {
    List<String> out = new ArrayList<>();
    if (raw instanceof List<?> list) {
      for (Object o : list) {
        String s = str(o).trim();
        if (!s.isEmpty()) {
          out.add(s);
        }
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> mergeReports(
      Map<String, Object> first, Map<String, Object> second, Map<String, Object> tree) {
    if (first == null) {
      return second;
    }
    if (second == null) {
      return first;
    }
    Map<String, Object> merged = new LinkedHashMap<>(first);
    List<Map<String, Object>> executed = new ArrayList<>();
    executed.addAll(mapList(first.get("executed")));
    executed.addAll(mapList(second.get("executed")));
    List<Map<String, Object>> failed = new ArrayList<>();
    failed.addAll(mapList(first.get("failed")));
    failed.addAll(mapList(second.get("failed")));
    List<Map<String, Object>> nav = new ArrayList<>();
    nav.addAll(mapList(first.get("navLinks")));
    nav.addAll(mapList(second.get("navLinks")));
    List<Map<String, Object>> duplicates = new ArrayList<>();
    duplicates.addAll(mapList(first.get("possibleDuplicates")));
    duplicates.addAll(mapList(second.get("possibleDuplicates")));
    merged.put("executed", executed);
    merged.put("failed", failed);
    merged.put("navLinks", nav);
    merged.put("possibleDuplicates", duplicates);
    merged.put("wrote", Boolean.TRUE.equals(first.get("wrote")) || Boolean.TRUE.equals(second.get("wrote")));
    merged.put(
        "subscribeUi",
        Boolean.TRUE.equals(first.get("subscribeUi")) || Boolean.TRUE.equals(second.get("subscribeUi")));
    if (second.get("subscribeItems") != null) {
      merged.put("subscribeItems", second.get("subscribeItems"));
    }
    Presentation.PresentationView view =
        Presentation.buildExecutionPresentation(executed, failed, duplicates, tree);
    merged.put("lead", view.lead());
    merged.put("blocks", view.blocks());
    merged.put("lines", view.lines());
    return merged;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> mapList(Object raw) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (raw instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          out.add((Map<String, Object>) m);
        }
      }
    }
    return out;
  }

  private static String clip(String text, int max) {
    if (text == null) {
      return "";
    }
    return text.length() <= max ? text : text.substring(0, max);
  }

  static final String NO_WRITE_RECEIPT = "没有写入回执。上一句不能当成已经改过台账。要改台账就调用工具，看见回执再告诉家人。";

  static final String BLANK_TURN = "这轮还没回答家人。不要交 JSON 或空话。查到的用白话说出来；要改账就调用工具；对不齐就 ask。";

  /** 没有写成，也没有给家人的话。查询条数不能冒充回答。 */
  static boolean blankTurn(String content, Map<String, Object> report, Map<String, Object> present) {
    if (wrote(report) || present != null) {
      return false;
    }
    String text = content == null ? "" : content.trim();
    return text.isEmpty() || text.startsWith("{") || text.startsWith("[");
  }

  private static boolean wrote(Map<String, Object> report) {
    return report != null && Boolean.TRUE.equals(report.get("wrote"));
  }

  private static final String[] WRITE_CLAIMS = {
    "已记上", "已记下", "已记好", "已经记下", "已经记上", "记好了", "记上了",
    "已添加", "已经添加", "已新建", "已改好", "已经改好",
    "已删除", "已经删除", "已删掉", "已去掉",
    "放好了", "办好了", "搞好了", "已经放好", "已经办好"
  };

  /** 这轮没有成功写入时，模型口头说「已记上」不能当成回执。 */
  static boolean unbackedWriteClaim(String text, Map<String, Object> report) {
    if (report != null && Boolean.TRUE.equals(report.get("wrote"))) {
      return false;
    }
    String t = text == null ? "" : text;
    for (String phrase : WRITE_CLAIMS) {
      if (t.contains(phrase)) {
        return true;
      }
    }
    return false;
  }

  private static final Set<String> PRESENT_TYPES = Set.of("table", "stats", "bars", "pie");
  private static final Set<String> PRESENT_GROUPS = Set.of("space", "tag", "location", "name");

  static Map<String, Object> presentSpec(Map<String, Object> args) {
    if (args == null || args.isEmpty()) {
      return null;
    }
    String type = str(args.get("type")).trim().toLowerCase(Locale.ROOT);
    type =
        switch (type) {
          case "bar" -> "bars";
          case "donut" -> "pie";
          case "stat" -> "stats";
          default -> type;
        };
    if (!PRESENT_TYPES.contains(type)) {
      return null;
    }
    Map<String, Object> spec = new LinkedHashMap<>();
    spec.put("type", type);
    spec.put("source", "probe");
    String groupBy = str(args.get("groupBy")).trim().toLowerCase(Locale.ROOT);
    if (PRESENT_GROUPS.contains(groupBy)) {
      spec.put("groupBy", groupBy);
    }
    String title = str(args.get("title")).trim();
    if (!title.isEmpty()) {
      spec.put("title", title.length() <= 24 ? title : title.substring(0, 24));
    }
    return spec;
  }

  private static String visible(String text) {
    String t = PlanParser.stripImitatedStamp(text);
    if (t.startsWith("{") || t.startsWith("[")) {
      return "";
    }
    return t;
  }

  private static List<Map<String, Object>> visibleAsk(List<Map<String, Object>> ask) {
    if (ask == null || ask.isEmpty()) {
      return ask;
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : ask) {
      if (row == null) {
        continue;
      }
      Map<String, Object> copy = new LinkedHashMap<>(row);
      Object question = copy.get("question");
      if (question != null) {
        copy.put("question", visible(String.valueOf(question)));
      }
      out.add(copy);
    }
    return out;
  }

  private static String searchSignature(Map<String, Object> call) {
    return String.join(
        "\0",
        str(call.get("name")),
        str(call.get("keyword")),
        str(call.get("spaceName")),
        str(call.get("locationName")),
        str(call.get("tagName")),
        str(call.get("maxQuantity")));
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
