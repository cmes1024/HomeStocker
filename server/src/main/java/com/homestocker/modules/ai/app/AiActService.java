package com.homestocker.modules.ai.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.ai.agent.ActBudget;
import com.homestocker.modules.ai.agent.ActContextBuilder;
import com.homestocker.modules.ai.agent.ActContextBuilder.ActContext;
import com.homestocker.modules.ai.agent.ActPrompt;
import com.homestocker.modules.ai.agent.ActToolLoop;
import com.homestocker.modules.ai.agent.ActPrompt.ActModelException;
import com.homestocker.modules.ai.agent.ActPrompt.AskResult;
import com.homestocker.modules.ai.agent.ActPrompt.ModelOpts;
import com.homestocker.modules.ai.agent.ActRefs;
import com.homestocker.modules.ai.agent.Guardrails;
import com.homestocker.modules.ai.agent.HabitReply;
import com.homestocker.modules.ai.agent.ItemsProbe;
import com.homestocker.modules.ai.agent.PresentResolver;
import com.homestocker.modules.ai.agent.PlanParser;
import com.homestocker.modules.ai.agent.PlanParser.ActPlan;
import com.homestocker.modules.ai.agent.Presentation;
import com.homestocker.modules.ai.habits.FamilyHabitService;
import com.homestocker.modules.ai.habits.HabitObserveService;
import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import com.homestocker.modules.ai.tools.ToolContext;
import com.homestocker.modules.ai.tools.ToolRegistry;
import com.homestocker.modules.family.app.FamilyTreeService;
import com.homestocker.modules.item.app.ItemService;
import com.homestocker.modules.space.app.SpaceService;
import com.homestocker.modules.tag.app.TagService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Port of agent/orchestrator.js */
@Service
public class AiActService {

  private static final Logger log = LoggerFactory.getLogger(AiActService.class);
  private static final int ACT_HTTP_TIMEOUT_MS = 12_000;
  private static final int ACT_MAX_TOKENS = 800;

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final ActKeyResolver actKeyResolver;
  private final AiSeedService aiSeedService;
  private final AiRateLimitService aiRateLimitService;
  private final ActContextBuilder actContextBuilder;
  private final ActPrompt actPrompt;
  private final ActToolLoop actToolLoop;
  private final ItemsProbe itemsProbe;
  private final ToolRegistry toolRegistry;
  private final ItemService itemService;
  private final SpaceService spaceService;
  private final TagService tagService;
  private final FamilyTreeService familyTreeService;
  private final FamilyHabitService familyHabitService;
  private final HabitObserveService habitObserveService;
  private final ActTurnReplay actTurnReplay;
  private final ActPendingPlan actPendingPlan;

  public AiActService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      ActKeyResolver actKeyResolver,
      AiSeedService aiSeedService,
      AiRateLimitService aiRateLimitService,
      ActContextBuilder actContextBuilder,
      ActPrompt actPrompt,
      ActToolLoop actToolLoop,
      ItemsProbe itemsProbe,
      ToolRegistry toolRegistry,
      ItemService itemService,
      SpaceService spaceService,
      TagService tagService,
      FamilyTreeService familyTreeService,
      FamilyHabitService familyHabitService,
      HabitObserveService habitObserveService,
      ActTurnReplay actTurnReplay,
      ActPendingPlan actPendingPlan) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.actKeyResolver = actKeyResolver;
    this.aiSeedService = aiSeedService;
    this.aiRateLimitService = aiRateLimitService;
    this.actContextBuilder = actContextBuilder;
    this.actPrompt = actPrompt;
    this.actToolLoop = actToolLoop;
    this.itemsProbe = itemsProbe;
    this.toolRegistry = toolRegistry;
    this.itemService = itemService;
    this.spaceService = spaceService;
    this.tagService = tagService;
    this.familyTreeService = familyTreeService;
    this.familyHabitService = familyHabitService;
    this.habitObserveService = habitObserveService;
    this.actTurnReplay = actTurnReplay;
    this.actPendingPlan = actPendingPlan;
  }

  public Map<String, Object> act(Map<String, Object> event) {
    String openid = RequestContext.require().openid();
    String turnId = ActTurnReplay.sanitize(event == null ? null : event.get("turnId"));
    ActTurnReplay.Claim claim = actTurnReplay.begin(openid, turnId);
    if (claim.kind() == ActTurnReplay.Kind.REPLAY) {
      return claim.payload();
    }
    if (claim.kind() == ActTurnReplay.Kind.BUSY) {
      return busyTurnPayload();
    }
    try {
      Map<String, Object> payload = performAct(event);
      attachConfirmPlan(openid, payload);
      actTurnReplay.succeed(openid, turnId, payload);
      return payload;
    } catch (RuntimeException ex) {
      actTurnReplay.fail(openid, turnId);
      throw ex;
    }
  }

  /** 确认卡返回前把 calls 存起来，客户端确认时带 planId 回来比对。 */
  @SuppressWarnings("unchecked")
  private void attachConfirmPlan(String openid, Map<String, Object> payload) {
    if (payload == null || !"confirm".equals(payload.get("status"))) {
      return;
    }
    if (!(payload.get("calls") instanceof List<?> raw)) {
      return;
    }
    List<Map<String, Object>> calls =
        raw.stream()
            .filter(o -> o instanceof Map)
            .map(o -> (Map<String, Object>) o)
            .toList();
    String planId = actPendingPlan.save(openid, calls);
    if (!planId.isEmpty()) {
      payload.put("planId", planId);
    }
  }

  private Map<String, Object> performAct(Map<String, Object> event) {
    String openid = RequestContext.require().openid();
    aiRateLimitService.checkAct(openid);
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null
        || familyId.isBlank()
        || !membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }

    boolean confirmed =
        Boolean.TRUE.equals(event.get("confirmed"))
            || "true".equalsIgnoreCase(String.valueOf(event.get("confirmed")));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> replayCalls =
        event.get("calls") instanceof List<?> raw
            ? raw.stream().filter(o -> o instanceof Map).map(o -> (Map<String, Object>) o).toList()
            : List.of();

    if (confirmed && !replayCalls.isEmpty()) {
      String planId = ActPendingPlan.sanitize(event.get("planId"));
      if (!planId.isEmpty()) {
        List<Map<String, Object>> expected = actPendingPlan.peek(openid, planId);
        if (expected == null) {
          throw ApiException.of(ErrorCodes.BAD_REQUEST, "确认已过期，请重新发起");
        }
        if (!expected.equals(replayCalls)) {
          log.warn("act confirm calls mismatch: openid={}", openid);
          throw ApiException.of(ErrorCodes.BAD_REQUEST, "确认内容与提示不一致，请重新发起");
        }
      } else {
        // 灰度兼容：老客户端不带 planId，先放行并留日志；客户端覆盖率上来后改为拒绝
        log.warn("act confirm without planId: openid={}", openid);
      }
      aiSeedService.ensureCapabilities();
      Map<String, Object> tree = familyTreeService.getOrRebuild(familyId);
      Map<String, Map<String, Object>> catalogMap = catalogMapFromDb();
      Map<String, Map<String, Object>> refs = new LinkedHashMap<>();
      List<String> ids = collectItemIds(replayCalls);
      itemsProbe.loadItemsByIds(familyId, tree, ids, refs, null);
      Map<String, Object> report =
          execute(familyId, openid, tree, replayCalls, refs, catalogMap, ShanghaiDates.todayYmd());
      // 执行成功才作废：失败时保留凭据，允许用同一份 calls 重试
      if (!planId.isEmpty()) {
        actPendingPlan.clear(openid, planId);
      }
      return sanitizeUserPayload(buildDonePayload(replayCalls, report, null), null, List.of());
    }

    String text = event.get("text") == null ? "" : String.valueOf(event.get("text")).trim();
    if (text.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_TEXT, "请输入一句话");
    }

    ActKeyResolver.Selection selection = actKeyResolver.select(familyId);
    if (selection.blocked()) {
      throw ApiException.of(ErrorCodes.NO_AI_KEY, "请先配置家庭 AI 密钥");
    }
    List<KeyRow> keys = selection.keys();

    ActContext actCtx = actContextBuilder.build(openid, event, familyId);
    ModelOpts modelOpts =
        new ModelOpts(
            keys,
            ACT_HTTP_TIMEOUT_MS,
            ACT_MAX_TOKENS,
            actCtx.history(),
            selection.hostedPool(),
            new ActBudget(System.currentTimeMillis()));

    ActToolLoop.Outcome outcome;
    try {
      outcome =
          actToolLoop.run(
              actCtx,
              modelOpts,
              calls ->
                  execute(
                      familyId,
                      openid,
                      actCtx.tree(),
                      calls,
                      actCtx.refs(),
                      actCtx.catalogMap(),
                      actCtx.today().get("ymd")));
    } catch (ActModelException e) {
      throw ApiException.of(e.code(), e.getMessage());
    }
    List<Map<String, Object>> rows = outcome.rows() == null ? List.of() : outcome.rows();
    return switch (outcome.kind()) {
      case ASK -> {
        Map<String, Object> askPayload =
            buildAskResponse(outcome.ask(), actCtx.focus(), rows, outcome.reply());
        attachExecutedReceipt(askPayload, outcome.report(), outcome.calls());
        yield sanitizeUserPayload(askPayload, actCtx.focus(), rows);
      }
      case CONFIRM -> {
        // turnTouched 取本轮写工具真实改过的行（report.touched，经 mergeReports 透传）；
        // 没有（本轮只读）才回退用读到的行。用于「删掉刚改过的行」警告。
        List<Map<String, Object>> turnTouched = touchedFromReport(outcome.report());
        if (turnTouched.isEmpty()) {
          turnTouched = rows;
        }
        Map<String, Object> confirmPayload =
            buildConfirmPayload(
                outcome.calls(), outcome.calls(), actCtx.refs(), actCtx.focus(), turnTouched);
        attachExecutedReceipt(confirmPayload, outcome.report(), List.of());
        yield confirmPayload;
      }
      case SUBSCRIBE ->
          buildSubscribePayload(
              outcome.calls(),
              outcome.report() == null ? Map.of() : outcome.report(),
              actCtx.focus());
      case DONE -> sanitizeUserPayload(finishToolDone(outcome, actCtx), actCtx.focus(), rows);
    };
  }

  private static Map<String, Object> busyTurnPayload() {
    String text = "上一句还在处理，请稍等再看家里的账。";
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "done");
    payload.put("lead", text);
    payload.put("reply", text);
    payload.put("ask", List.of());
    payload.put("confirm", List.of());
    payload.put("calls", List.of());
    payload.put("wrote", false);
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("lead", text);
    report.put("lines", List.of(text));
    report.put("wrote", false);
    payload.put("report", report);
    return payload;
  }

  private Map<String, Object> finishToolDone(ActToolLoop.Outcome outcome, ActContext actCtx) {
    List<Map<String, Object>> calls = outcome.calls() == null ? List.of() : outcome.calls();
    List<Map<String, Object>> rows = outcome.rows() == null ? List.of() : outcome.rows();
    Map<String, Object> report = outcome.report();
    String reply = outcome.reply() == null ? "" : outcome.reply().trim();
    boolean wrote = report != null && Boolean.TRUE.equals(report.get("wrote"));
    Map<String, Object> present = outcome.present();
    Map<String, Object> payload;
    if (wrote || (report != null && report.get("navLinks") instanceof List<?> links && !links.isEmpty())) {
      payload = buildDonePayload(calls, report, actCtx.focus());
      if (!reply.isEmpty()) {
        payload.put("lead", reply);
      }
      if (present != null) {
        Map<String, Object> resolved = PresentResolver.resolve(present, rows, report);
        if (resolved != null) {
          payload.put("present", resolved);
        }
      }
    } else {
      if (HabitReply.habitOnly(report)) {
        List<Map<String, Object>> habits = HabitReply.habitsOf(report);
        if (habits.size() >= HabitReply.TABLE_MIN) {
          present = HabitReply.table(habits);
          reply = "这家偏好 " + habits.size() + " 条";
        } else {
          present = null;
          reply = HabitReply.lines(habits);
        }
      } else if (present == null && rows.size() >= 1) {
        present = new LinkedHashMap<>();
        present.put("type", "table");
        present.put("source", "probe");
      }
      payload = attachDoneReply(reply, actCtx.focus(), present, rows, report);
      payload.put("calls", calls);
    }
    return payload;
  }




  private Map<String, Object> execute(
      String familyId,
      String openid,
      Map<String, Object> tree,
      List<Map<String, Object>> calls,
      Map<String, Map<String, Object>> refs,
      Map<String, Map<String, Object>> catalogMap,
      String todayYmd) {
    ToolContext ctx =
        new ToolContext(
            openid,
            familyId,
            tree,
            refs,
            catalogMap,
            todayYmd,
            itemService,
            spaceService,
            tagService);
    return toolRegistry.runAll(ctx, calls);
  }

  private Map<String, Map<String, Object>> catalogMapFromDb() {
    Map<String, Object> catalog = aiSeedService.ensureCapabilities();
    Map<String, Map<String, Object>> map = new LinkedHashMap<>();
    for (Map<String, Object> api : CapabilityCatalog.enabledApis(catalog)) {
      map.put(String.valueOf(api.get("id")), api);
    }
    return map;
  }

  private static List<String> collectItemIds(List<Map<String, Object>> calls) {
    List<String> ids = new ArrayList<>();
    java.util.Set<String> seen = new java.util.LinkedHashSet<>();
    for (Map<String, Object> c : calls) {
      if (c == null) {
        continue;
      }
      List<String> list = new ArrayList<>();
      if (c.get("itemIds") instanceof List<?> il) {
        for (Object id : il) {
          list.add(String.valueOf(id));
        }
      } else if (c.get("itemId") != null) {
        list.add(String.valueOf(c.get("itemId")));
      }
      for (String s : list) {
        if (s != null && !s.isBlank() && seen.add(s.trim())) {
          ids.add(s.trim());
        }
      }
    }
    return ids;
  }

  private static boolean isIdlePlan(ActPlan plan) {
    if (plan == null) {
      return true;
    }
    if (!plan.ask().isEmpty()) {
      return false;
    }
    if (plan.probe() != null) {
      return false;
    }
    if (!plan.calls().isEmpty()) {
      return false;
    }
    if (plan.present() != null && !plan.present().isEmpty()) {
      return false;
    }
    return plan.reply().isEmpty();
  }

  /** 提问气泡里带上本轮查库事实。模型已经说出查到或没查到时不重复。 */
  private static String withProbeFact(
      String reply, Map<String, Object> probe, List<Map<String, Object>> rows) {
    String fact = replyOrProbeFact("", probe, rows);
    String spoken = reply == null ? "" : reply.trim();
    if (fact.isEmpty()) {
      return spoken;
    }
    if (spoken.isEmpty()) {
      return fact;
    }
    if (spoken.contains("没查到") || spoken.contains("查到")) {
      return spoken;
    }
    return fact + "\n" + spoken;
  }

  /**
   * 模型查完仍只提问、却没写 reply 时，用本轮查库事实补一句。不读用户原话。
   */
  private static String replyOrProbeFact(
      String reply, Map<String, Object> probe, List<Map<String, Object>> rows) {
    if (reply != null && !reply.isBlank()) {
      return reply;
    }
    if (rows != null && !rows.isEmpty()) {
      StringBuilder sb = new StringBuilder("查到了：");
      int n = 0;
      for (Map<String, Object> row : rows) {
        String label = PlanParser.probeOptionLabel(row);
        if (label.isEmpty()) {
          continue;
        }
        if (n > 0) {
          sb.append('，');
        }
        sb.append(label);
        n++;
        if (n >= 5) {
          break;
        }
      }
      return n == 0 ? "" : sb.toString();
    }
    if (probe == null) {
      return "";
    }
    String name = str(probe.get("name")).trim();
    if (name.isEmpty() && probe.get("names") instanceof List<?> names) {
      StringBuilder sb = new StringBuilder();
      for (Object item : names) {
        String one = str(item).trim();
        if (one.isEmpty()) {
          continue;
        }
        if (sb.length() > 0) {
          sb.append('、');
        }
        sb.append(one);
      }
      name = sb.toString();
    }
    if (!name.isEmpty()) {
      return "家里没查到" + name + "。";
    }
    return "家里没查到匹配的物资。";
  }

  /** 纯提问、且本轮还没有任何库存事实。模型仍自己决定查什么。 */
  private static boolean askBeforeAnyInventoryFacts(
      ActPlan plan, List<Map<String, Object>> turnRows) {
    if (plan == null || plan.probe() != null || !plan.calls().isEmpty() || plan.ask().isEmpty()) {
      return false;
    }
    return turnRows == null || turnRows.isEmpty();
  }

  private static boolean claimsInventoryAbsenceWithoutFacts(
      ActPlan plan, List<Map<String, Object>> turnRows) {
    if (plan == null) {
      return false;
    }
    if (turnRows != null && !turnRows.isEmpty()) {
      return false;
    }
    if (plan.probe() != null || isInventoryReadOnlyCalls(plan.calls())) {
      return false;
    }
    String blob = str(plan.reply());
    for (Map<String, Object> ask : plan.ask()) {
      if (ask != null) {
        blob = blob + "\n" + str(ask.get("question"));
      }
    }
    if (blob.isBlank()) {
      return false;
    }
    return blob.contains("没找到")
        || blob.contains("没有找到")
        || blob.contains("未找到")
        || blob.contains("查不到")
        || blob.contains("台账里没")
        || blob.contains("家里没查到")
        || blob.contains("家里没有")
        || blob.contains("库里没有");
  }

  private static boolean isInventoryReadOnlyCalls(List<Map<String, Object>> calls) {
    if (calls == null || calls.isEmpty()) {
      return false;
    }
    return calls.stream()
        .allMatch(
            c -> {
              String use = c == null ? "" : String.valueOf(c.get("use")).trim();
              return "item.search".equals(use)
                  || "item.listExpiring".equals(use)
                  || "activity.list".equals(use)
                  || "item.stats".equals(use)
                  || "habit.list".equals(use)
                  || "habit.observe".equals(use);
            });
  }

  /**
   * 从 item.stats 结构化 buckets 生成 present（不编汇报散文）。优先带分桶的 space/tag；否则用 total。
   */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> presentFromStatsReport(Map<String, Object> report) {
    if (report == null) {
      return null;
    }
    Object exec = report.get("executed");
    if (!(exec instanceof List<?> executed) || executed.isEmpty()) {
      return null;
    }
    Map<String, Object> best = null;
    for (Object rowObj : executed) {
      if (!(rowObj instanceof Map<?, ?> row)) {
        continue;
      }
      if (!"item.stats".equals(str(row.get("use")).trim())) {
        continue;
      }
      Object statsObj = row.get("stats");
      if (!(statsObj instanceof Map<?, ?>)) {
        continue;
      }
      Map<String, Object> stats = (Map<String, Object>) statsObj;
      String groupBy = str(stats.get("groupBy")).trim().toLowerCase();
      List<Map<String, Object>> buckets =
          stats.get("buckets") instanceof List<?> b
              ? (List<Map<String, Object>>) b
              : List.of();
      if (buckets.isEmpty()) {
        continue;
      }
      Map<String, Object> candidate = new LinkedHashMap<>();
      candidate.put("type", "stats");
      candidate.put("groupBy", groupBy.isEmpty() ? "total" : groupBy);
      if ("space".equals(groupBy)) {
        candidate.put("title", "各空间物资行数");
      } else if ("tag".equals(groupBy)) {
        candidate.put("title", "各标签物资行数");
      } else {
        candidate.put("title", "物资行数");
      }
      List<Map<String, Object>> items = new ArrayList<>();
      for (Map<String, Object> bucket : buckets) {
        if (bucket == null) {
          continue;
        }
        String label = str(bucket.get("label")).trim();
        if (label.isEmpty()) {
          continue;
        }
        items.add(Map.of("label", label, "value", bucket.get("value")));
      }
      if (items.isEmpty()) {
        continue;
      }
      candidate.put("items", items);
      if ("space".equals(groupBy) || "tag".equals(groupBy)) {
        return candidate;
      }
      best = candidate;
    }
    return best;
  }

  /** 查询回执里是否已有可给家人看的库存列表卡（不含 item.stats 机器串） */
  @SuppressWarnings("unchecked")
  private static boolean hasUserFacingInventory(Map<String, Object> report) {
    if (report == null) {
      return false;
    }
    if (report.get("blocks") instanceof List<?> blocks && !blocks.isEmpty()) {
      for (Object b : blocks) {
        if (b instanceof Map<?, ?> block
            && block.get("cards") instanceof List<?> cards
            && !cards.isEmpty()) {
          return true;
        }
      }
    }
    Object exec = report.get("executed");
    if (!(exec instanceof List<?> executed)) {
      return false;
    }
    for (Object rowObj : executed) {
      if (!(rowObj instanceof Map<?, ?> row)) {
        continue;
      }
      if (row.get("inventory") instanceof List<?> inv && !inv.isEmpty()) {
        return true;
      }
    }
    return false;
  }

  /** Prefer tool summaries (aggregates / habits) plus P* inventory when both exist. */
  private static String buildReadOnlyResultNote(
      Map<String, Object> report, List<Map<String, Object>> invRows) {
    List<String> summaries = new ArrayList<>();
    Object exec = report != null ? report.get("executed") : null;
    if (exec instanceof List<?> executed) {
      for (Object rowObj : executed) {
        if (!(rowObj instanceof Map<?, ?> row)) {
          continue;
        }
        if ("habit.list".equals(str(row.get("use")).trim())
            && row.get("habits") instanceof List<?> habitRows) {
          summaries.add(formatHabitFactsForModel(habitRows));
          continue;
        }
        String summary = str(row.get("summary")).trim();
        if (!summary.isEmpty()) {
          summaries.add(summary);
        }
      }
    }
    boolean hasInv = invRows != null && !invRows.isEmpty();
    if (!summaries.isEmpty() && hasInv) {
      return "查询结果：\n"
          + String.join("\n", summaries)
          + "\n短号：\n"
          + ActPrompt.renderProbeRows(invRows);
    }
    if (hasInv) {
      return "查询结果已写入本轮短号：\n" + ActPrompt.renderProbeRows(invRows);
    }
    if (!summaries.isEmpty()) {
      return "查询结果：\n" + String.join("\n", summaries);
    }
    return "查询结果：无匹配";
  }

  /** habit.list 结构化事实 → 重编排注；由模型决定 reply/present，代码不写家人气泡。 */
  private static String formatHabitFactsForModel(List<?> habitRows) {
    if (habitRows == null || habitRows.isEmpty()) {
      return "本家习惯：无";
    }
    StringBuilder sb = new StringBuilder("本家习惯（").append(habitRows.size()).append(" 条，按槽计）：");
    for (Object o : habitRows) {
      if (!(o instanceof Map<?, ?> m)) {
        continue;
      }
      String label = str(m.get("label")).trim();
      if (label.isEmpty()) {
        label = str(m.get("slot")).trim();
      }
      String text = str(m.get("text")).trim();
      sb.append('\n').append("- ").append(label).append("：").append(text);
      if (Boolean.TRUE.equals(m.get("needsResplit"))) {
        sb.append("（非纯空间名，应拆成空间名 + 其它槽重记）");
      }
    }
    return sb.toString();
  }

  private static ActPlan ensurePresentHasFacts(
      ActPlan plan, List<Map<String, Object>> turnRows) {
    if (plan == null || plan.present() == null || plan.present().isEmpty()) {
      return plan;
    }
    if (plan.probe() != null || !plan.ask().isEmpty()) {
      return plan;
    }
    if (turnRows != null && !turnRows.isEmpty()) {
      return plan;
    }
    Map<String, Object> present = new LinkedHashMap<>(plan.present());
    if (!presentNeedsFactSource(present)) {
      return plan;
    }
    if (str(present.get("source")).isBlank()) {
      present.put("source", "probe");
    }
    return new ActPlan(plan.ask(), Map.of("listAll", true), plan.calls(), plan.reply(), present);
  }

  private static boolean presentNeedsFactSource(Map<String, Object> present) {
    if (present == null) {
      return false;
    }
    String type = str(present.get("type")).trim().toLowerCase();
    if (type.isEmpty()) {
      return false;
    }
    if (present.get("rows") instanceof List<?> rows && !rows.isEmpty()) {
      return false;
    }
    if (present.get("items") instanceof List<?> items && !items.isEmpty()) {
      return false;
    }
    String source = str(present.get("source")).trim().toLowerCase();
    return source.isEmpty()
        || source.equals("probe")
        || source.equals("p")
        || source.equals("inventory")
        || source.equals("inv")
        || source.equals("search");
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }

  private static ActPlan ensureProbeForUnresolvedWrites(
      ActPlan plan, Map<String, Map<String, Object>> refs) {
    if (plan.probe() != null || !plan.ask().isEmpty()) {
      return plan;
    }
    List<Map<String, Object>> calls = new ArrayList<>(plan.calls());
    for (Map<String, Object> call : calls) {
      if (call == null) {
        continue;
      }
      String use = String.valueOf(call.get("use")).trim();
      if ("item.update".equals(use) || "item.remove".equals(use)) {
        if (ActRefs.lookupRef(call, refs) != null) {
          continue;
        }
        String name = String.valueOf(call.get("name")).trim();
        Map<String, Object> probe = new LinkedHashMap<>();
        if (!name.isEmpty()) {
          probe.put("name", name);
          probe.put("spaceName", String.valueOf(call.get("fromSpaceName")).trim());
          probe.put("locationName", String.valueOf(call.get("fromLocationName")).trim());
          return new ActPlan(plan.ask(), probe, plan.calls(), plan.reply(), plan.present());
        }
        return new ActPlan(plan.ask(), Map.of("listAll", true), plan.calls(), plan.reply(), plan.present());
      }
    }
    return plan;
  }

  /**
   * 记入前先按名称查库：让模型看见同名行（单位/位置），避免漏单位、或另开位置造成「同名两条」。
   */
  @SuppressWarnings("unchecked")
  private static ActPlan ensureProbeForNamedCreates(ActPlan plan) {
    if (plan == null || plan.probe() != null || !plan.ask().isEmpty()) {
      return plan;
    }
    List<String> names = new ArrayList<>();
    java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
    for (Map<String, Object> call : plan.calls()) {
      if (call == null) {
        continue;
      }
      String use = String.valueOf(call.get("use")).trim();
      if ("item.create".equals(use)) {
        String name = str(call.get("name")).trim();
        if (!name.isEmpty() && seen.add(name)) {
          names.add(name);
        }
      } else if ("item.createMany".equals(use) && call.get("items") instanceof List<?> items) {
        for (Object o : items) {
          if (!(o instanceof Map<?, ?> m)) {
            continue;
          }
          String name = str(m.get("name")).trim();
          if (!name.isEmpty() && seen.add(name)) {
            names.add(name);
          }
        }
      }
    }
    if (names.isEmpty()) {
      return plan;
    }
    Map<String, Object> probe = new LinkedHashMap<>();
    if (names.size() == 1) {
      probe.put("name", names.get(0));
    } else {
      probe.put("names", names);
    }
    return new ActPlan(plan.ask(), probe, plan.calls(), plan.reply(), plan.present());
  }

  private static void bindUnresolvedWritesToProbe(
      ActPlan plan, Map<String, Map<String, Object>> refs, List<Map<String, Object>> probedRows) {
    Map<String, Map<String, Object>> pool = new LinkedHashMap<>();
    if (refs != null) {
      pool.putAll(refs);
    }
    if (probedRows != null) {
      for (Map<String, Object> row : probedRows) {
        if (row == null) {
          continue;
        }
        String ref = str(row.get("ref")).trim();
        if (!ref.isEmpty()) {
          pool.putIfAbsent(ref, row);
        }
        String id = str(row.get("itemId")).trim();
        if (!id.isEmpty()) {
          pool.putIfAbsent("ID:" + id, row);
        }
      }
    }
    for (Map<String, Object> call : plan.calls()) {
      if (call == null) {
        continue;
      }
      String use = String.valueOf(call.get("use")).trim();
      if (!"item.update".equals(use) && !"item.remove".equals(use)) {
        continue;
      }
      Map<String, Object> hit = ActRefs.lookupRef(call, pool);
      if (hit == null && str(call.get("name")).isBlank() && probedRows != null && probedRows.size() == 1) {
        hit = probedRows.get(0);
      }
      if (hit == null) {
        continue;
      }
      if (str(call.get("ref")).isBlank() && hit.get("ref") != null) {
        call.put("ref", hit.get("ref"));
      }
      if (!call.containsKey("name") || str(call.get("name")).isBlank()) {
        call.put("name", hit.get("name"));
      }
      if (refs != null && hit.get("ref") != null && !str(hit.get("ref")).isBlank()) {
        refs.putIfAbsent(str(hit.get("ref")), hit);
      }
    }
  }

  private static boolean hasUnresolvedItemWrites(
      ActPlan plan, Map<String, Map<String, Object>> refs) {
    List<Map<String, Object>> bound = ActRefs.bindCallIds(plan.calls(), refs);
    for (Map<String, Object> c : bound) {
      if (c == null) {
        continue;
      }
      String use = String.valueOf(c.get("use")).trim();
      if ("item.update".equals(use) || "item.remove".equals(use)) {
        if (ActRefs.lookupRef(c, refs) == null) {
          return true;
        }
      }
      if ("item.merge".equals(use) || "item.removeMany".equals(use)) {
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) c.get("itemIds");
        int need = "item.merge".equals(use) ? 2 : 1;
        if (ids == null || ids.stream().filter(x -> x != null && !x.isBlank()).count() < need) {
          return true;
        }
      }
    }
    return false;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> ingestInventoryToProbeRefs(
      Map<String, Object> report, Map<String, Object> tree, Map<String, Map<String, Object>> refs) {
    List<Map<String, Object>> rows = new ArrayList<>();
    java.util.Set<String> seen = new java.util.LinkedHashSet<>();
    int n = 0;
    for (String k : refs.keySet()) {
      if (k.matches("(?i)^P\\d+$")) {
        n = Math.max(n, Integer.parseInt(k.replaceAll("\\D", "")));
      }
    }
    Object exec = report.get("executed");
    if (!(exec instanceof List<?> executed)) {
      return rows;
    }
    Map<String, Object> useTree =
        report.get("tree") instanceof Map<?, ?> t ? (Map<String, Object>) t : tree;
    for (Object rowObj : executed) {
      if (!(rowObj instanceof Map<?, ?> row) || !(row.get("inventory") instanceof List<?> inv)) {
        continue;
      }
      for (Object itemObj : inv) {
        if (!(itemObj instanceof Map<?, ?> item)) {
          continue;
        }
        String id = String.valueOf(((Map<?, ?>) item).get("_id"));
        if (id.isBlank()) {
          id = String.valueOf(((Map<?, ?>) item).get("itemId"));
        }
        if (id.isBlank() || !seen.add(id)) {
          continue;
        }
        n++;
        Map<String, Object> compact =
            ActRefs.compactItem((Map<String, Object>) item, "P" + n, useTree);
        refs.put(String.valueOf(compact.get("ref")), compact);
        rows.add(compact);
      }
    }
    return rows;
  }

  private Map<String, Object> buildAskResponse(
      List<Map<String, Object>> ask, Map<String, Object> focus, List<Map<String, Object>> probedRows) {
    return buildAskResponse(ask, focus, probedRows, "");
  }

  private Map<String, Object> buildAskResponse(
      List<Map<String, Object>> ask,
      Map<String, Object> focus,
      List<Map<String, Object>> probedRows,
      String reply) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "ask");
    payload.put(
        "ask",
        PlanParser.enrichAskOptionsFromProbe(PlanParser.presentChoiceAsks(ask), probedRows));
    if (reply != null && !reply.isBlank()) {
      payload.put("reply", reply.trim());
    }
    payload.put("probe", null);
    payload.put("calls", List.of());
    payload.put("draft", PlanParser.draftFromCalls(List.of()));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    return payload;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> touchedFromReport(Map<String, Object> report) {
    if (report == null || !(report.get("touched") instanceof List<?> raw)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object o : raw) {
      if (o instanceof Map) {
        out.add((Map<String, Object>) o);
      }
    }
    return out;
  }

  private Map<String, Object> buildConfirmPayload(
      List<Map<String, Object>> planCalls,
      List<Map<String, Object>> confirmCalls,
      Map<String, Map<String, Object>> refs,
      Map<String, Object> focus,
      List<Map<String, Object>> turnTouched) {
    List<Map<String, Object>> boundCalls = ActRefs.bindCallIds(planCalls, refs);
    Map<String, Object> removeWarn = removeConfirmWarnForUpdates(boundCalls, turnTouched);
    List<Map<String, Object>> confirmView = new ArrayList<>();
    for (Map<String, Object> call : confirmCalls) {
      Map<String, Object> view = new LinkedHashMap<>(confirmCallView(call, refs));
      view.put("label", confirmActionLabel(call, view));
      confirmView.add(view);
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "confirm");
    payload.put("ask", List.of());
    if (removeWarn != null) {
      payload.put("confirmKind", "removeUpdated");
      payload.put("confirmTitle", removeWarn.get("title"));
      payload.put("confirmHint", removeWarn.get("hint"));
    } else if (boundCalls.stream().anyMatch(AiActService::isNonRemoveWrite)) {
      payload.put("confirmKind", "batch");
      payload.put("confirmTitle", "确认这些改动吗？");
      payload.put("confirmHint", "点确认才会写入。先不算了，这些都不会改。");
    }
    payload.put("confirm", confirmView);
    payload.put("calls", boundCalls);
    payload.put("draft", PlanParser.draftFromCalls(boundCalls));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    return payload;
  }

  private static boolean isNonRemoveWrite(Map<String, Object> call) {
    if (call == null) {
      return false;
    }
    String use = String.valueOf(call.get("use") == null ? "" : call.get("use")).trim();
    return !use.isEmpty() && !use.contains("remove") && !"item.merge".equals(use);
  }

  /** 确认卡上的一行：写出模型这次调用要做的事，避免只剩物资名。 */
  private static String confirmActionLabel(Map<String, Object> call, Map<String, Object> view) {
    String use = String.valueOf(call.get("use") == null ? "" : call.get("use")).trim();
    String name = firstNonBlank(view.get("name"), call.get("name"), "这项");
    if ("item.update".equals(use) && call.get("quantity") != null) {
      return name + " 数量改成 " + call.get("quantity");
    }
    if ("item.create".equals(use) || "item.createMany".equals(use)) {
      return "记入 " + name;
    }
    if ("item.merge".equals(use)) {
      return "合并 " + name;
    }
    if (use.contains("remove")) {
      return "删除 " + name;
    }
    if (use.startsWith("space.create") || use.startsWith("tag.create") || "habit.upsert".equals(use)) {
      return "记下 " + name;
    }
    return name;
  }

  private static void attachExecutedReceipt(
      Map<String, Object> payload, Map<String, Object> report, List<Map<String, Object>> executedCalls) {
    if (payload == null || report == null || !Boolean.TRUE.equals(report.get("wrote"))) {
      return;
    }
    payload.put("wrote", true);
    if (report.get("blocks") != null) {
      payload.put("blocks", report.get("blocks"));
    }
    if (report.get("lead") != null) {
      payload.put("lead", report.get("lead"));
    }
    if (executedCalls != null && !executedCalls.isEmpty() && payload.get("calls") instanceof List<?> existing && existing.isEmpty()) {
      payload.put("calls", executedCalls);
    }
  }

  private static Map<String, Object> removeConfirmWarnForUpdates(
      List<Map<String, Object>> boundCalls, List<Map<String, Object>> turnTouched) {
    Map<String, Map<String, Object>> recentById = new LinkedHashMap<>();
    if (turnTouched != null) {
      for (Map<String, Object> row : turnTouched) {
        if (row != null && row.get("itemId") != null) {
          recentById.put(String.valueOf(row.get("itemId")), row);
        }
      }
    }
    List<String> ids = new ArrayList<>();
    if (boundCalls != null) {
      for (Map<String, Object> c : boundCalls) {
        if (c == null) {
          continue;
        }
        String use = String.valueOf(c.get("use")).trim();
        if (!"item.remove".equals(use) && !"item.removeMany".equals(use)) {
          continue;
        }
        if (c.get("itemIds") instanceof List<?> list) {
          for (Object id : list) {
            if (id != null && !String.valueOf(id).isBlank()) {
              ids.add(String.valueOf(id));
            }
          }
        } else if (c.get("itemId") != null) {
          ids.add(String.valueOf(c.get("itemId")));
        }
      }
    }
    if (ids.isEmpty()) {
      return null;
    }
    List<Map<String, Object>> touched = new ArrayList<>();
    for (String id : ids) {
      Map<String, Object> row = recentById.get(id);
      if (row != null) {
        touched.add(row);
      }
    }
    if (touched.isEmpty()) {
      return null;
    }
    boolean allUpdates =
        touched.stream().allMatch(r -> "update".equals(String.valueOf(r.get("op")).trim()));
    if (!allUpdates) {
      return null;
    }
    return Map.of(
        "title",
        "确定整条删除吗？",
        "hint",
        "刚才是改了原有物资的数量，不是新开条目。删掉会把原来的库存一并去掉，不只是撤销刚才 +1。");
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> confirmCallView(
      Map<String, Object> call, Map<String, Map<String, Object>> refs) {
    Map<String, Object> bound = ActRefs.bindCallIds(List.of(call), refs).get(0);
    if (bound == null) {
      bound = call;
    }
    String use = String.valueOf(call.get("use")).trim();
    if ("item.merge".equals(use) || "item.removeMany".equals(use)) {
      List<String> names = new ArrayList<>();
      if (bound.get("itemIds") instanceof List<?> ids) {
        for (Object id : ids) {
          Map<String, Object> row = ActRefs.lookupRef(Map.of("itemId", id), refs);
          if (row != null && row.get("name") != null && !String.valueOf(row.get("name")).isBlank()) {
            names.add(String.valueOf(row.get("name")));
          }
        }
      }
      if (names.isEmpty() && bound.get("names") instanceof List<?> fallback) {
        for (Object n : fallback) {
          if (n != null && !String.valueOf(n).isBlank()) {
            names.add(String.valueOf(n));
          }
        }
      }
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("use", call.get("use"));
      out.put("refs", bound.getOrDefault("refs", List.of()));
      out.put("itemIds", bound.getOrDefault("itemIds", List.of()));
      out.put("name", bound.get("name") != null ? bound.get("name") : (names.isEmpty() ? "物资" : names.get(0)));
      out.put("names", names);
      return out;
    }
    if ("space.removeMany".equals(use)
        || "tag.removeMany".equals(use)
        || "tag.createMany".equals(use)) {
      List<String> names = new ArrayList<>();
      if (bound.get("names") instanceof List<?> nl) {
        for (Object n : nl) {
          String s = String.valueOf(n == null ? "" : n).trim();
          if (!s.isEmpty()) {
            names.add(s);
          }
        }
      }
      if (names.isEmpty() && bound.get("spaces") instanceof List<?> spaces) {
        for (Object o : spaces) {
          if (o instanceof Map<?, ?> m) {
            String s = String.valueOf(m.get("name") != null ? m.get("name") : m.get("spaceName")).trim();
            if (!s.isEmpty()) {
              names.add(s);
            }
          }
        }
      }
      if (names.isEmpty() && bound.get("tags") instanceof List<?> tags) {
        for (Object o : tags) {
          if (o instanceof Map<?, ?> m) {
            String s = String.valueOf(m.get("name") != null ? m.get("name") : m.get("tagName")).trim();
            if (!s.isEmpty()) {
              names.add(s);
            }
          }
        }
      }
      return Map.of(
          "use",
          call.get("use"),
          "names",
          names,
          "name",
          names.isEmpty()
              ? (bound.get("name") != null ? String.valueOf(bound.get("name")) : "多项")
              : names.get(0));
    }
    if ("space.removeLocationMany".equals(use)) {
      List<String> labels = new ArrayList<>();
      if (bound.get("locations") instanceof List<?> locs) {
        for (Object o : locs) {
          if (o instanceof Map<?, ?> m) {
            String sn = String.valueOf(m.get("spaceName") == null ? "" : m.get("spaceName")).trim();
            String ln =
                String.valueOf(
                        m.get("locationName") != null
                            ? m.get("locationName")
                            : m.get("name") == null ? "" : m.get("name"))
                    .trim();
            String label = !sn.isEmpty() && !ln.isEmpty() ? sn + "/" + ln : (!ln.isEmpty() ? ln : sn);
            if (!label.isEmpty()) {
              labels.add(label);
            }
          }
        }
      }
      return Map.of(
          "use",
          call.get("use"),
          "names",
          labels,
          "name",
          labels.isEmpty() ? "位置" : labels.get(0));
    }
    if ("space.remove".equals(use) || "tag.remove".equals(use) || "tag.create".equals(use)) {
      String name =
          firstNonBlank(
              bound.get("spaceName"), bound.get("name"), bound.get("tagName"));
      return Map.of(
          "use",
          call.get("use"),
          "name",
          name.isEmpty() ? "项目" : name,
          "names",
          name.isEmpty() ? List.of() : List.of(name));
    }
    if ("space.removeLocation".equals(use)) {
      String sn = String.valueOf(bound.get("spaceName") == null ? "" : bound.get("spaceName")).trim();
      String ln =
          firstNonBlank(bound.get("locationName"), bound.get("name"));
      String label =
          !sn.isEmpty() && !ln.isEmpty() ? sn + "/" + ln : (!ln.isEmpty() ? ln : (!sn.isEmpty() ? sn : "位置"));
      return Map.of("use", call.get("use"), "name", label, "names", List.of(label));
    }
    Map<String, Object> row = ActRefs.lookupRef(call, refs);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("use", call.get("use"));
    out.put("ref", call.get("ref") != null ? call.get("ref") : "");
    out.put(
        "itemId",
        row != null && row.get("itemId") != null
            ? row.get("itemId")
            : (call.get("itemId") != null ? call.get("itemId") : ""));
    out.put(
        "name",
        row != null && row.get("name") != null
            ? row.get("name")
            : (call.get("name") != null ? call.get("name") : ""));
    return out;
  }

  private static String firstNonBlank(Object... vals) {
    for (Object v : vals) {
      if (v == null) {
        continue;
      }
      String s = String.valueOf(v).trim();
      if (!s.isEmpty()) {
        return s;
      }
    }
    return "";
  }

  private Map<String, Object> buildDonePayload(
      List<Map<String, Object>> planCalls, Map<String, Object> report, Map<String, Object> focus) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "done");
    payload.put("ask", List.of());
    payload.put("confirm", List.of());
    payload.put("calls", planCalls);
    payload.put("report", slimReport(report));
    payload.put("lead", report.get("lead"));
    payload.put("blocks", report.getOrDefault("blocks", List.of()));
    payload.put("draft", PlanParser.draftFromCalls(planCalls));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", Boolean.TRUE.equals(report.get("wrote")));
    List<Map<String, Object>> navLinks = collectNavLinks(report);
    if (!navLinks.isEmpty()) {
      payload.put("navLinks", navLinks);
    }
    return payload;
  }




  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> collectNavLinks(Map<String, Object> report) {
    List<Map<String, Object>> out = new ArrayList<>();
    java.util.Set<String> seen = new java.util.LinkedHashSet<>();
    java.util.function.Consumer<Map<String, Object>> push =
        link -> {
          if (link == null) {
            return;
          }
          String url = String.valueOf(link.get("url") == null ? "" : link.get("url")).trim();
          if (url.isEmpty() || !seen.add(url)) {
            return;
          }
          out.add(link);
        };
    if (report.get("navLinks") instanceof List<?> top) {
      for (Object o : top) {
        if (o instanceof Map<?, ?> m) {
          push.accept((Map<String, Object>) m);
        }
      }
    }
    if (report.get("executed") instanceof List<?> exec) {
      for (Object o : exec) {
        if (o instanceof Map<?, ?> row && row.get("navLinks") instanceof List<?> nl) {
          for (Object link : nl) {
            if (link instanceof Map<?, ?> m) {
              push.accept((Map<String, Object>) m);
            }
          }
        }
      }
    }
    return out;
  }

  private Map<String, Object> buildSubscribePayload(
      List<Map<String, Object>> calls, Map<String, Object> report, Map<String, Object> focus) {
    Map<String, Object> payload = buildDonePayload(calls, report, focus);
    payload.put("status", "subscribe");
    payload.put("subscribeItems", report.get("subscribeItems"));
    return payload;
  }

  private Map<String, Object> attachDoneReply(String reply, Map<String, Object> focus) {
    return attachDoneReply(reply, focus, null, List.of(), null);
  }

  private Map<String, Object> attachDoneReply(
      String reply,
      Map<String, Object> focus,
      Map<String, Object> presentRaw,
      List<Map<String, Object>> probeRows,
      Map<String, Object> inventoryReadReport) {
    Map<String, Object> present =
        PresentResolver.resolve(presentRaw, probeRows, inventoryReadReport);
    String replyText = reply == null ? "" : reply.trim();
    // 有结构化展示时，不把空 reply / 占位 lead 冒充正文
    if (present != null && isNoopLead(replyText)) {
      replyText = "";
    }
    Presentation.PresentationView p = Presentation.textOnlyPresentation(replyText);
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "done");
    payload.put("ask", List.of());
    payload.put("confirm", List.of());
    payload.put("calls", List.of());
    if (inventoryReadReport != null) {
      Map<String, Object> report = new LinkedHashMap<>(slimReport(inventoryReadReport));
      if (present != null) {
        String kept = replyText.isEmpty() ? str(inventoryReadReport.get("lead")) : replyText;
        report.put("blocks", List.of());
        report.put("lines", kept.isEmpty() ? List.of() : List.of(kept));
        report.put("lead", kept);
        payload.put("blocks", List.of());
        payload.put("lead", kept);
      }
      payload.put("report", report);
    } else {
      Map<String, Object> report = new LinkedHashMap<>();
      report.put("executed", List.of());
      report.put("failed", List.of());
      report.put("possibleDuplicates", List.of());
      report.put("lines", present != null ? List.of() : p.lines());
      report.put("lead", replyText);
      report.put("wrote", false);
      payload.put("report", report);
      payload.put("lead", replyText);
      if (present != null) {
        payload.put("blocks", List.of());
      }
    }
    payload.put("draft", PlanParser.draftFromCalls(List.of()));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    if (present != null) {
      payload.put("present", present);
      return payload;
    }
    return Presentation.attachPresentation(payload, p);
  }

  private static boolean isNoopLead(String text) {
    String t = text == null ? "" : text.trim();
    return t.isEmpty() || AssistPromptTexts.INTERNAL_NOOP_LEAD.equals(t);
  }

  /** 空 done / 内部 noop 不得直接给用户：降级为 ask。 */
  @SuppressWarnings("unchecked")
  private Map<String, Object> sanitizeUserPayload(
      Map<String, Object> payload, Map<String, Object> focus, List<Map<String, Object>> rows) {
    if (payload == null) {
      return buildDegradeAsk(focus, rows);
    }
    scrubInternalNoop(payload);
    if (needsUserDegrade(payload)) {
      log.warn("act degrade: empty or noop done payload");
      return buildDegradeAsk(focus, rows);
    }
    return payload;
  }

  private Map<String, Object> buildDegradeAsk(
      Map<String, Object> focus, List<Map<String, Object>> rows) {
    return buildAskResponse(
        List.of(Map.of("question", AssistPromptTexts.DEGRADE_ASK, "options", List.of())),
        focus,
        rows != null ? rows : List.of());
  }

  @SuppressWarnings("unchecked")
  private static boolean needsUserDegrade(Map<String, Object> payload) {
    if (!"done".equals(String.valueOf(payload.get("status")))) {
      return false;
    }
    if (Boolean.TRUE.equals(payload.get("wrote"))) {
      return false;
    }
    if (payload.get("present") instanceof Map<?, ?> p && !p.isEmpty()) {
      return false;
    }
    if (payload.get("subscribeItems") instanceof List<?> s && !s.isEmpty()) {
      return false;
    }
    if (payload.get("navLinks") instanceof List<?> n && !n.isEmpty()) {
      return false;
    }
    if (payload.get("confirm") instanceof List<?> c && !c.isEmpty()) {
      return false;
    }
    if (hasVisibleBlocks(payload.get("blocks"))) {
      return false;
    }
    Map<String, Object> report =
        payload.get("report") instanceof Map<?, ?> m
            ? (Map<String, Object>) m
            : Map.of();
    if (hasVisibleBlocks(report.get("blocks"))) {
      return false;
    }
    if (hasUsefulLines(report.get("lines"))) {
      return false;
    }
    String lead = str(payload.get("lead"));
    if (lead.isEmpty()) {
      lead = str(report.get("lead"));
    }
    return isNoopLead(lead);
  }

  private static boolean hasVisibleBlocks(Object raw) {
    if (!(raw instanceof List<?> blocks) || blocks.isEmpty()) {
      return false;
    }
    for (Object b : blocks) {
      if (!(b instanceof Map<?, ?> block)) {
        continue;
      }
      if (block.get("cards") instanceof List<?> cards && !cards.isEmpty()) {
        return true;
      }
      if (!str(block.get("title")).isBlank()) {
        return true;
      }
    }
    return false;
  }

  private static boolean hasUsefulLines(Object raw) {
    if (!(raw instanceof List<?> lines) || lines.isEmpty()) {
      return false;
    }
    for (Object o : lines) {
      String t = str(o).trim();
      if (!t.isEmpty() && !AssistPromptTexts.INTERNAL_NOOP_LEAD.equals(t)) {
        return true;
      }
    }
    return false;
  }

  @SuppressWarnings("unchecked")
  private static void scrubInternalNoop(Map<String, Object> payload) {
    if (AssistPromptTexts.INTERNAL_NOOP_LEAD.equals(str(payload.get("lead")).trim())) {
      payload.put("lead", "");
    }
    if (payload.get("report") instanceof Map<?, ?> raw) {
      Map<String, Object> report = new LinkedHashMap<>((Map<String, Object>) raw);
      if (AssistPromptTexts.INTERNAL_NOOP_LEAD.equals(str(report.get("lead")).trim())) {
        report.put("lead", "");
      }
      if (report.get("lines") instanceof List<?> lines) {
        List<String> cleaned = new ArrayList<>();
        for (Object o : lines) {
          String t = str(o).trim();
          if (!t.isEmpty() && !AssistPromptTexts.INTERNAL_NOOP_LEAD.equals(t)) {
            cleaned.add(t);
          }
        }
        report.put("lines", cleaned);
      }
      payload.put("report", report);
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> slimReport(Map<String, Object> report) {
    Map<String, Object> r = new LinkedHashMap<>();
    List<Map<String, Object>> executed = new ArrayList<>();
    if (report.get("executed") instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> row) {
          executed.add(
              Map.of(
                  "step", row.get("step"),
                  "use", row.get("use"),
                  "summary", row.get("summary")));
        }
      }
    }
    r.put("executed", executed);
    r.put("failed", report.getOrDefault("failed", List.of()));
    r.put("possibleDuplicates", report.getOrDefault("possibleDuplicates", List.of()));
    r.put("lines", report.get("lines"));
    r.put("lead", report.get("lead"));
    r.put("blocks", report.getOrDefault("blocks", List.of()));
    r.put("wrote", report.get("wrote"));
    r.put("replanned", report.get("replanned"));
    return r;
  }

  private static Map<String, Object> focusPublic(Map<String, Object> focus) {
    if (focus == null) {
      return null;
    }
    return Map.of("ref", focus.get("ref"), "name", focus.get("name"));
  }

  private static Map<String, Object> mergeCreateReports(Map<String, Object> first, Map<String, Object> second) {
    int offset = stepOffset(first);
    List<Map<String, Object>> executed = copyMapList(first.get("executed"));
    List<Map<String, Object>> failed = copyMapList(first.get("failed"));
    List<Map<String, Object>> possibleDuplicates = copyMapList(first.get("possibleDuplicates"));
    for (Map<String, Object> row : copyMapList(second.get("executed"))) {
      Map<String, Object> copy = new LinkedHashMap<>(row);
      int step = row.get("step") instanceof Number n ? n.intValue() : 0;
      copy.put("step", step + offset);
      executed.add(copy);
    }
    for (Map<String, Object> row : copyMapList(second.get("failed"))) {
      Map<String, Object> copy = new LinkedHashMap<>(row);
      int step = row.get("step") instanceof Number n ? n.intValue() : 0;
      copy.put("step", step + offset);
      failed.add(copy);
    }
    possibleDuplicates.addAll(copyMapList(second.get("possibleDuplicates")));
    Map<String, Object> tree =
        second.get("tree") instanceof Map<?, ?> t
            ? (Map<String, Object>) t
            : (first.get("tree") instanceof Map<?, ?> f ? (Map<String, Object>) f : Map.of());
    Presentation.PresentationView presentation =
        Presentation.buildExecutionPresentation(executed, failed, possibleDuplicates, tree);
    List<Map<String, Object>> touched = new ArrayList<>();
    touched.addAll(copyMapList(first.get("touched")));
    touched.addAll(copyMapList(second.get("touched")));
    List<Map<String, Object>> navLinks = new ArrayList<>();
    navLinks.addAll(copyMapList(first.get("navLinks")));
    navLinks.addAll(copyMapList(second.get("navLinks")));
    Map<String, Object> merged = new LinkedHashMap<>();
    merged.put("executed", executed);
    merged.put("failed", failed);
    merged.put("pending", second.getOrDefault("pending", List.of()));
    merged.put("createClassFailed", Boolean.TRUE.equals(second.get("createClassFailed")));
    merged.put("possibleDuplicates", possibleDuplicates);
    List<String> lines = presentation.lines();
    merged.put("lines", lines);
    merged.put(
        "lead",
        !presentation.lead().isEmpty()
            ? presentation.lead()
            : (first.get("lead") != null ? first.get("lead") : ""));
    merged.put("blocks", presentation.blocks());
    merged.put("touched", touched);
    merged.put(
        "wrote", Boolean.TRUE.equals(first.get("wrote")) || Boolean.TRUE.equals(second.get("wrote")));
    merged.put(
        "subscribeUi",
        Boolean.TRUE.equals(second.get("subscribeUi")) || Boolean.TRUE.equals(first.get("subscribeUi")));
    merged.put(
        "subscribeItems",
        second.get("subscribeItems") != null
            ? second.get("subscribeItems")
            : first.getOrDefault("subscribeItems", List.of()));
    merged.put("navLinks", navLinks);
    merged.put("tree", tree);
    merged.put("replanned", true);
    return merged;
  }

  private static int stepOffset(Map<String, Object> report) {
    int max = 0;
    for (String key : List.of("executed", "failed")) {
      for (Map<String, Object> row : copyMapList(report.get(key))) {
        int n = row.get("step") instanceof Number num ? num.intValue() : 0;
        if (n > max) {
          max = n;
        }
      }
    }
    return max;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> copyMapList(Object raw) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      if (o instanceof Map<?, ?> m) {
        out.add(new LinkedHashMap<>((Map<String, Object>) m));
      }
    }
    return out;
  }

  private static List<Map<String, Object>> concatCalls(
      List<Map<String, Object>> a, List<Map<String, Object>> b) {
    List<Map<String, Object>> out = new ArrayList<>(a);
    out.addAll(b);
    return out;
  }

  private static boolean isKnowledgeOnlyReport(Map<String, Object> report) {
    if (Boolean.TRUE.equals(report.get("wrote")) || Boolean.TRUE.equals(report.get("subscribeUi"))) {
      return false;
    }
    if (!(report.get("executed") instanceof List<?> exec)) {
      return false;
    }
    boolean hasKnowledge =
        exec.stream()
            .anyMatch(
                r ->
                    r instanceof Map<?, ?> m
                        && "knowledge.get".equals(m.get("use"))
                        && m.get("knowledge") instanceof Map<?, ?> k
                        && k.get("body") != null);
    return hasKnowledge;
  }

  private static boolean isPageDocOnlyReport(Map<String, Object> report) {
    if (Boolean.TRUE.equals(report.get("wrote")) || Boolean.TRUE.equals(report.get("subscribeUi"))) {
      return false;
    }
    // 已带跳转链时不再当「仅说明」跟进，避免再次问模型
    if (report.get("navLinks") instanceof List<?> n && !n.isEmpty()) {
      return false;
    }
    if (!(report.get("executed") instanceof List<?> exec)) {
      return false;
    }
    return exec.stream()
        .anyMatch(
            r ->
                r instanceof Map<?, ?> m
                    && "page.get".equals(m.get("use"))
                    && m.get("pageDoc") instanceof Map<?, ?> p
                    && p.get("body") != null);
  }

  private static String collectKnowledgeBodies(Map<String, Object> report) {
    StringBuilder sb = new StringBuilder();
    if (report.get("executed") instanceof List<?> exec) {
      for (Object o : exec) {
        if (o instanceof Map<?, ?> row && row.get("knowledge") instanceof Map<?, ?> k) {
          String body = String.valueOf(k.get("body")).trim();
          if (!body.isEmpty()) {
            if (sb.length() > 0) {
              sb.append("\n\n");
            }
            String title = String.valueOf(k.get("title")).trim();
            sb.append(title.isEmpty() ? body : title + "\n" + body);
          }
        }
      }
    }
    return sb.toString();
  }

  private static String collectPageBodies(Map<String, Object> report) {
    StringBuilder sb = new StringBuilder();
    if (report.get("executed") instanceof List<?> exec) {
      for (Object o : exec) {
        if (o instanceof Map<?, ?> row && row.get("pageDoc") instanceof Map<?, ?> p) {
          if ("navLinks".equals(row.get("ui"))) {
            continue;
          }
          String body = String.valueOf(p.get("body")).trim();
          if (!body.isEmpty()) {
            if (sb.length() > 0) {
              sb.append("\n\n");
            }
            String kind = "index".equals(p.get("kind")) ? "页面目录" : "页面说明";
            sb.append(kind).append("\n").append(body);
          }
        }
      }
    }
    return sb.toString();
  }

  private static String knowledgeFallbackText(Map<String, Object> report) {
    if (report.get("executed") instanceof List<?> exec) {
      for (Object o : exec) {
        if (o instanceof Map<?, ?> r && "knowledge.get".equals(r.get("use"))) {
          return String.valueOf(r.get("summary")).trim();
        }
      }
    }
    return "";
  }

  private static String pageFallbackText(Map<String, Object> report) {
    if (report.get("executed") instanceof List<?> exec) {
      for (Object o : exec) {
        if (o instanceof Map<?, ?> r && "page.get".equals(r.get("use")) && r.get("pageDoc") != null) {
          return String.valueOf(r.get("summary")).trim();
        }
      }
    }
    return "";
  }
}
