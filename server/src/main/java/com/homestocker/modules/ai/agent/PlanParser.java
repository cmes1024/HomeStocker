package com.homestocker.modules.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.modules.ai.app.AssistPromptTexts;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Port of agent/plan.js */
public final class PlanParser {

  private static final Set<String> BOUNDARY_ASKS =
      Set.of(AssistPromptTexts.CAPABILITY_LIMIT_ASK, AssistPromptTexts.OUT_OF_SCOPE_ASK);

  private PlanParser() {}

  public record ActPlan(
      List<Map<String, Object>> ask,
      Map<String, Object> probe,
      List<Map<String, Object>> calls,
      String reply,
      Map<String, Object> present,
      List<String> appliedHabits) {
    public ActPlan(
        List<Map<String, Object>> ask,
        Map<String, Object> probe,
        List<Map<String, Object>> calls,
        String reply,
        Map<String, Object> present) {
      this(ask, probe, calls, reply, present, List.of());
    }

    public ActPlan(
        List<Map<String, Object>> ask,
        Map<String, Object> probe,
        List<Map<String, Object>> calls,
        String reply) {
      this(ask, probe, calls, reply, null, List.of());
    }
  }

  public static ActPlan parsePlan(String text, ObjectMapper objectMapper) {
    String raw =
        str(text)
            .trim()
            .replaceFirst("^```(?:json)?\\s*", "")
            .replaceFirst("\\s*```$", "");
    try {
      JsonNode parsed = objectMapper.readTree(raw);
      if (!parsed.isObject()) {
        throw new IllegalArgumentException("invalid plan shape");
      }
      List<Map<String, Object>> ask = normalizeAsk(parsed.get("ask"));
      Map<String, Object> probe = normalizeProbe(parsed.get("probe"));
      List<Map<String, Object>> calls = new ArrayList<>();
      if (parsed.has("calls") && parsed.get("calls").isArray()) {
        for (JsonNode c : parsed.get("calls")) {
          if (c.isObject()) {
            calls.add(objectMapper.convertValue(c, Map.class));
          }
          if (calls.size() >= 20) {
            break;
          }
        }
      }
      String reply = normalizeReply(parsed.path("reply").asText(""));
      if (reply.isEmpty()) {
        reply = normalizeReply(parsed.path("answer").asText(""));
      }
      if (reply.isEmpty()) {
        reply = normalizeReply(parsed.path("message").asText(""));
      }
      if (!ask.isEmpty() || !calls.isEmpty()) {
        reply = "";
      }
      Map<String, Object> present = normalizePresent(parsed.get("present"), objectMapper);
      List<String> appliedHabits = normalizeAppliedHabits(parsed.get("appliedHabits"));
      ActPlan plan = new ActPlan(ask, probe, calls, reply, present, appliedHabits);
      return coerceBoundaryReplyToAsk(plan);
    } catch (Exception e) {
      throw new IllegalArgumentException("invalid plan json", e);
    }
  }

  /**
   * 模型偶发吐出口头句（常带历史时间戳样式）而不是 JSON。把可读回复收成 reply 计划，
   * 避免服务端用「刚才没办妥」顶掉模型已经说清楚的话。疑似伪造写回执则拒绝回收。
   */
  public static ActPlan coercePlainTextPlan(String text) {
    String t = stripImitatedStamp(str(text).trim());
    if (t.isEmpty() || t.startsWith("{") || t.startsWith("[")) {
      return null;
    }
    if (looksLikeFalseWriteReceipt(t)) {
      return null;
    }
    String reply = normalizeReply(t);
    if (reply.isEmpty()) {
      return null;
    }
    return new ActPlan(List.of(), null, List.of(), reply, null);
  }

  /** 去掉模型模仿历史消息时加的时间戳外壳。 */
  static String stripImitatedStamp(String text) {
    String t = str(text).trim();
    t = t.replaceAll("\\[\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}\\]", "");
    t = t.replaceAll("（消息时间 \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}）", "");
    return t.trim();
  }

  /** 口头句若声称已写入/已改数量，不能当 reply 直接给用户（库可能没动）。 */
  static boolean looksLikeFalseWriteReceipt(String text) {
    String t = str(text);
    if (t.contains("已改") && t.contains("→")) {
      return true;
    }
    if (t.contains("已记下") || t.contains("已删除") || t.contains("已删掉")) {
      return true;
    }
    return t.contains("从") && t.contains("改成");
  }

  private static ActPlan coerceBoundaryReplyToAsk(ActPlan plan) {
    if (!plan.ask.isEmpty() || !plan.calls.isEmpty() || plan.probe != null) {
      return plan;
    }
    String reply = str(plan.reply).trim();
    if (!BOUNDARY_ASKS.contains(reply)) {
      return plan;
    }
    List<Map<String, Object>> ask = new ArrayList<>();
    Map<String, Object> one = new LinkedHashMap<>();
    one.put("question", reply);
    one.put("options", List.of());
    ask.add(one);
    return new ActPlan(ask, null, List.of(), "", null, List.of());
  }

  private static List<String> normalizeAppliedHabits(JsonNode raw) {
    if (raw == null || raw.isNull() || !raw.isArray()) {
      return List.of();
    }
    List<String> out = new ArrayList<>();
    for (JsonNode n : raw) {
      String id = n == null || n.isNull() ? "" : n.asText("").trim();
      if (id.isEmpty() || out.contains(id)) {
        continue;
      }
      out.add(id);
      if (out.size() >= 7) {
        break;
      }
    }
    return List.copyOf(out);
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> normalizePresent(JsonNode raw, ObjectMapper objectMapper) {
    if (raw == null || raw.isNull() || !raw.isObject()) {
      return null;
    }
    Map<String, Object> map = objectMapper.convertValue(raw, Map.class);
    if (map == null || map.isEmpty()) {
      return null;
    }
    String type = str(map.get("type")).trim().toLowerCase();
    if (!Set.of("table", "stats", "stat", "bars", "bar", "pie", "donut").contains(type)) {
      return null;
    }
    return map;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> normalizeAsk(JsonNode raw) {
    if (raw == null || raw.isNull()) {
      return List.of();
    }
    List<JsonNode> list = new ArrayList<>();
    if (raw.isArray()) {
      raw.forEach(list::add);
    } else {
      list.add(raw);
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (JsonNode item : list) {
      if (item == null || item.isNull()) {
        continue;
      }
      Map<String, Object> row = new LinkedHashMap<>();
      if (item.isTextual()) {
        String q = item.asText("").trim();
        if (!q.isEmpty()) {
          row.put("question", q);
          row.put("options", List.of());
          out.add(row);
        }
        continue;
      }
      String question =
          item.path("question").asText(item.path("text").asText(item.path("prompt").asText("")))
              .trim();
      if (question.isEmpty()) {
        continue;
      }
      row.put("question", question);
      List<Map<String, Object>> options = new ArrayList<>();
      if (item.has("options") && item.get("options").isArray()) {
        for (JsonNode opt : item.get("options")) {
          Map<String, Object> choice = optionChoice(opt);
          if (choice != null) {
            options.add(choice);
          }
        }
      }
      row.put("options", options);
      out.add(row);
    }
    return out;
  }

  private static final java.util.regex.Pattern INVENTED_QTY =
      java.util.regex.Pattern.compile(
          "(?:\\d+(?:\\.\\d+)?|[一二两三四五六七八九十半]+)\\s*(?:盒|瓶|个|只|斤|公斤|千克|袋|包|箱|件|台|支|条|罐|桶|升|毫升|克|两)(?:\\s*/\\s*(?:盒|瓶|个|只|斤|袋|包|箱|件|台|支|条|罐|桶))?");

  private static final java.util.regex.Pattern WRITE_VERB =
      java.util.regex.Pattern.compile("记|加|减|买|补|入|放|进");

  /**
   * 提问还没有写入字段时，按钮不保留模型随口写的数量。多行选择收成选项，不铺成正文。
   */
  public static List<Map<String, Object>> presentChoiceAsks(List<Map<String, Object>> ask) {
    if (ask == null || ask.isEmpty()) {
      return ask == null ? List.of() : ask;
    }
    List<Map<String, Object>> rows = new ArrayList<>();
    boolean onlyChoices = true;
    for (Map<String, Object> item : ask) {
      if (item == null) {
        continue;
      }
      Map<String, Object> copy = new LinkedHashMap<>(item);
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> options =
          item.get("options") instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
      List<Map<String, Object>> scrubbed = new ArrayList<>();
      for (Map<String, Object> opt : options) {
        if (opt == null) {
          continue;
        }
        String label = stripInventedQuantity(str(opt.get("label")));
        String value = stripInventedQuantity(str(opt.get("value")));
        if (label.isEmpty() && value.isEmpty()) {
          continue;
        }
        Map<String, Object> one = new LinkedHashMap<>();
        one.put("label", label.isEmpty() ? value : label);
        one.put("value", value.isEmpty() ? label : value);
        scrubbed.add(one);
      }
      String question = str(item.get("question")).trim();
      if (!options.isEmpty() || looksLikeQuestion(question)) {
        onlyChoices = false;
      } else {
        question = stripInventedQuantity(question);
      }
      copy.put("question", question);
      copy.put("options", scrubbed);
      if (!question.isEmpty() || !scrubbed.isEmpty()) {
        rows.add(copy);
      }
    }
    if (!onlyChoices || rows.size() < 2) {
      return rows;
    }
    List<Map<String, Object>> options = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      String label = str(row.get("question")).trim();
      if (label.isEmpty()) {
        continue;
      }
      Map<String, Object> one = new LinkedHashMap<>();
      one.put("label", label);
      one.put("value", label);
      options.add(one);
    }
    if (options.size() < 2) {
      return rows;
    }
    Map<String, Object> choice = new LinkedHashMap<>();
    choice.put("question", "");
    choice.put("options", options);
    return List.of(choice);
  }

  static String stripInventedQuantity(String raw) {
    String text = raw == null ? "" : raw.trim();
    if (text.isEmpty() || !WRITE_VERB.matcher(text).find()) {
      return text;
    }
    String stripped = INVENTED_QTY.matcher(text).replaceAll("");
    stripped = stripped.replaceAll("^[，,、/\\s]+|[，,、/\\s]+$", "");
    stripped = stripped.replaceAll("([，,、]){2,}", "，");
    stripped = stripped.replaceAll("^记[，,、\\s]+", "");
    return stripped.trim();
  }

  private static boolean looksLikeQuestion(String question) {
    return question.contains("？")
        || question.contains("?")
        || question.contains("吗")
        || question.contains("多少")
        || question.contains("哪儿")
        || question.contains("哪里")
        || question.contains("哪");
  }

  private static Map<String, Object> optionChoice(JsonNode opt) {
    if (opt == null || opt.isNull()) {
      return null;
    }
    if (opt.isTextual()) {
      return optionChoice(opt.asText(), opt.asText());
    }
    String label = opt.path("label").asText(opt.path("value").asText("")).trim();
    String value = opt.path("value").asText(opt.path("label").asText("")).trim();
    return optionChoice(label, value);
  }

  private static Map<String, Object> optionChoice(String label, String value) {
    String l = str(label).trim();
    String v = str(value).trim();
    if (l.isEmpty() && v.isEmpty()) {
      return null;
    }
    String useLabel = l.isEmpty() ? v : l;
    boolean machine = v.matches("(?i)^[a-z][a-z0-9_-]*$") && v.length() <= 32;
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("label", useLabel);
    m.put("value", machine || v.isEmpty() ? useLabel : v);
    return m;
  }

  private static Map<String, Object> normalizeProbe(JsonNode raw) {
    if (raw == null || raw.isNull() || !raw.isObject()) {
      return null;
    }
    String spaceName = raw.path("spaceName").asText("").trim();
    String locationName = raw.path("locationName").asText("").trim();
    String name = raw.path("name").asText("").trim();
    List<String> names = new ArrayList<>();
    if (raw.has("names") && raw.get("names").isArray()) {
      for (JsonNode n : raw.get("names")) {
        String s = n.asText("").trim();
        if (!s.isEmpty()) {
          names.add(s);
        }
      }
    }
    boolean listAll = raw.path("list").asBoolean(false) || "family".equals(raw.path("scope").asText("").trim());
    if (spaceName.isEmpty() && locationName.isEmpty() && name.isEmpty() && names.isEmpty() && !listAll) {
      return null;
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("spaceName", spaceName);
    out.put("locationName", locationName);
    out.put("name", name);
    out.put("listAll", listAll);
    if (!names.isEmpty()) {
      out.put("names", names);
    }
    return out;
  }

  private static String normalizeReply(String raw) {
    String text = str(raw).trim();
    if (text.isEmpty()) {
      return "";
    }
    return text.length() > 800 ? text.substring(0, 800) : text;
  }

  public static Map<String, Object> draftFromCalls(List<Map<String, Object>> calls) {
    Map<String, Object> many = null;
    if (calls != null) {
      for (Map<String, Object> c : calls) {
        if (c != null && "item.createMany".equals(str(c.get("use")))) {
          many = c;
          break;
        }
      }
    }
    if (many != null && many.get("items") instanceof List<?> items && !items.isEmpty()) {
      Object firstObj = items.get(0);
      Map<String, Object> first =
          firstObj instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
      return draftFields(first, str(many.get("spaceName")));
    }
    Map<String, Object> create = Map.of();
    if (calls != null) {
      for (Map<String, Object> c : calls) {
        if (c != null && "item.create".equals(str(c.get("use")))) {
          create = c;
          break;
        }
      }
      if (create.isEmpty() && !calls.isEmpty() && calls.get(0) != null) {
        create = calls.get(0);
      }
    }
    return draftFields(create, "");
  }

  private static Map<String, Object> draftFields(Map<String, Object> create, String fallbackSpace) {
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("name", str(create.get("name")).trim());
    d.put("quantity", create.get("quantity"));
    d.put("unit", str(create.get("unit")).trim());
    d.put("note", str(create.get("note")).trim());
    String sn = str(create.get("spaceName")).trim();
    d.put("spaceName", sn.isEmpty() ? fallbackSpace : sn);
    d.put("locationName", str(create.get("locationName")).trim());
    d.put("expireDate", create.get("expireDate") != null ? create.get("expireDate") : "");
    d.put("productionDate", create.get("productionDate") != null ? create.get("productionDate") : "");
    return d;
  }

  public static String probeOptionLabel(Map<String, Object> row) {
    if (row == null) {
      return "";
    }
    String name = str(row.get("name")).trim();
    if (name.isEmpty()) {
      return "";
    }
    String qty = str(row.get("quantity")) + str(row.get("unit"));
    String place = TreeMatch.placeLabel(str(row.get("spaceName")), str(row.get("locationName")));
    StringBuilder sb = new StringBuilder(name);
    if (!qty.isEmpty()) {
      sb.append(' ').append(qty);
    }
    if (!place.isEmpty()) {
      sb.append('（').append(place).append('）');
    }
    return sb.toString();
  }

  public static List<Map<String, Object>> optionsFromProbeRows(List<Map<String, Object>> rows) {
    List<Map<String, Object>> opts = new ArrayList<>();
    java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
    if (rows != null) {
      for (Map<String, Object> row : rows) {
        String label = probeOptionLabel(row);
        if (label.isEmpty() || seen.contains(label)) {
          continue;
        }
        seen.add(label);
        Map<String, Object> choice = optionChoice(label, label);
        if (choice != null) {
          opts.add(choice);
        }
      }
    }
    if (opts.size() >= 2) {
      Map<String, Object> all = optionChoice("相关记录都改", "相关记录都改");
      if (all != null) {
        opts.add(all);
      }
    }
    return opts;
  }

  public static List<Map<String, Object>> enrichAskOptionsFromProbe(
      List<Map<String, Object>> ask, List<Map<String, Object>> probedRows) {
    if (ask == null || ask.isEmpty() || probedRows == null || probedRows.size() < 2) {
      // 单条命中不需要「点哪条」身份芯片；否则会盖住模型的动作澄清选项
      return ask;
    }
    List<Map<String, Object>> chips = optionsFromProbeRows(probedRows);
    if (chips.isEmpty()) {
      return ask;
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (int i = 0; i < ask.size(); i++) {
      Map<String, Object> item = ask.get(i);
      if (item == null || i > 0) {
        out.add(item);
        continue;
      }
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> options = (List<Map<String, Object>>) item.get("options");
      if (!askOptionsNeedEnrichment(options)) {
        out.add(item);
        continue;
      }
      Map<String, Object> copy = new LinkedHashMap<>(item);
      copy.put("options", chips);
      out.add(copy);
    }
    return out;
  }

  /** 仅当模型没给可用选项、或只给了裸短号时，才用 probe 行补「点哪条」芯片。 */
  private static boolean askOptionsNeedEnrichment(List<Map<String, Object>> options) {
    if (options == null || options.isEmpty()) {
      return true;
    }
    if (options.size() == 1) {
      String t = str(options.get(0).get("label"));
      if (t.matches("(?i).*P\\d+.*") && t.matches(".*[和;；].*")) {
        return true;
      }
    }
    return options.stream()
        .allMatch(o -> str(o.get("label")).trim().matches("(?i)^[FPR]\\d+$"));
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
