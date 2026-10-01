package com.homestocker.modules.ai.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.ai.agent.ActContextBuilder;
import com.homestocker.modules.ai.agent.ActContextBuilder.ActContext;
import com.homestocker.modules.ai.agent.ActPrompt;
import com.homestocker.modules.ai.agent.ActPrompt.ActModelException;
import com.homestocker.modules.ai.agent.ActPrompt.AskResult;
import com.homestocker.modules.ai.agent.ActPrompt.ModelOpts;
import com.homestocker.modules.ai.agent.ActRefs;
import com.homestocker.modules.ai.agent.Guardrails;
import com.homestocker.modules.ai.agent.ItemsProbe;
import com.homestocker.modules.ai.agent.PlanParser;
import com.homestocker.modules.ai.agent.PlanParser.ActPlan;
import com.homestocker.modules.ai.agent.Presentation;
import com.homestocker.modules.ai.agent.Receipts;
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
  private static final int ACT_HTTP_TIMEOUT_MS = 20_000;
  private static final int ACT_MAX_TOKENS = 800;

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final AiKeyService aiKeyService;
  private final AiSeedService aiSeedService;
  private final AiRateLimitService aiRateLimitService;
  private final ActContextBuilder actContextBuilder;
  private final ActPrompt actPrompt;
  private final ItemsProbe itemsProbe;
  private final ToolRegistry toolRegistry;
  private final ItemService itemService;
  private final SpaceService spaceService;
  private final TagService tagService;
  private final FamilyTreeService familyTreeService;

  public AiActService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      AiKeyService aiKeyService,
      AiSeedService aiSeedService,
      AiRateLimitService aiRateLimitService,
      ActContextBuilder actContextBuilder,
      ActPrompt actPrompt,
      ItemsProbe itemsProbe,
      ToolRegistry toolRegistry,
      ItemService itemService,
      SpaceService spaceService,
      TagService tagService,
      FamilyTreeService familyTreeService) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.aiKeyService = aiKeyService;
    this.aiSeedService = aiSeedService;
    this.aiRateLimitService = aiRateLimitService;
    this.actContextBuilder = actContextBuilder;
    this.actPrompt = actPrompt;
    this.itemsProbe = itemsProbe;
    this.toolRegistry = toolRegistry;
    this.itemService = itemService;
    this.spaceService = spaceService;
    this.tagService = tagService;
    this.familyTreeService = familyTreeService;
  }

  public Map<String, Object> act(Map<String, Object> event) {
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
      aiSeedService.ensureCapabilities();
      Map<String, Object> tree = familyTreeService.getOrRebuild(familyId);
      Map<String, Map<String, Object>> catalogMap = catalogMapFromDb();
      Map<String, Map<String, Object>> refs = new LinkedHashMap<>();
      List<String> ids = collectItemIds(replayCalls);
      itemsProbe.loadItemsByIds(familyId, tree, ids, refs, null);
      Map<String, Object> report =
          execute(familyId, openid, tree, replayCalls, refs, catalogMap, ShanghaiDates.todayYmd());
      return buildDonePayload(replayCalls, report, null);
    }

    String text = event.get("text") == null ? "" : String.valueOf(event.get("text")).trim();
    if (text.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_TEXT, "请输入一句话");
    }

    List<KeyRow> keys = aiKeyService.listOrderedRawKeys();
    if (keys.isEmpty()) {
      throw ApiException.of(ErrorCodes.NO_AI_KEY, "请先配置家庭 AI 密钥");
    }

    ActContext actCtx = actContextBuilder.build(openid, event, familyId);
    ModelOpts modelOpts =
        new ModelOpts(keys, ACT_HTTP_TIMEOUT_MS, ACT_MAX_TOKENS, actCtx.history());

    ActPlan plan;
    try {
      plan = actPrompt.askModel(modelOpts, actCtx.system(), actCtx.userText()).plan();
    } catch (ActModelException e) {
      throw ApiException.of(e.code(), e.getMessage());
    }

    List<Map<String, Object>> probedRows = new ArrayList<>();
    List<Map<String, Object>> turnRows = new ArrayList<>(actCtx.turnRows());

    if (!plan.ask().isEmpty()) {
      return buildAskResponse(plan.ask(), actCtx.focus(), List.of());
    }

    plan = ensureProbeForUnresolvedWrites(plan, actCtx.refs());

    if (plan.probe() != null) {
      probedRows = itemsProbe.runProbe(familyId, actCtx.tree(), plan.probe(), actCtx.refs());
      turnRows.addAll(probedRows);
      Map<String, String> vars = new LinkedHashMap<>(actCtx.vars());
      vars.put("probe", ActPrompt.renderProbeRows(probedRows));
      String system = replanSystem(actCtx, vars);
      String probeNote =
          probedRows.isEmpty()
              ? "探查结果：无匹配物资"
              : "探查结果：\n" + ActPrompt.renderProbeRows(probedRows);
      plan = askPlan(modelOpts, system, actCtx.userText() + "\n" + probeNote);
      plan = new ActPlan(plan.ask(), null, plan.calls(), plan.reply());
      bindUnresolvedWritesToProbe(plan, actCtx.refs(), probedRows);
      if (!plan.ask().isEmpty()) {
        return buildAskResponse(plan.ask(), actCtx.focus(), probedRows);
      }
    }

    if (isIdlePlan(plan)) {
      plan = recoverIdlePlan(modelOpts, actCtx, probedRows, turnRows, familyId);
      if (!plan.ask().isEmpty()) {
        return buildAskResponse(plan.ask(), actCtx.focus(), probedRows);
      }
    }

    if (isIdlePlan(plan)) {
      List<Map<String, Object>> rowsForAsk = probedRows.isEmpty() ? turnRows : probedRows;
      if (!rowsForAsk.isEmpty()) {
        String question =
            rowsForAsk.size() == 1
                ? "要对「" + PlanParser.probeOptionLabel(rowsForAsk.get(0)) + "」做什么？"
                : "要对下面哪几条操作？点选后说要做什么。";
        return buildAskResponse(
            List.of(Map.of("question", question, "options", PlanParser.optionsFromProbeRows(rowsForAsk))),
            actCtx.focus(),
            rowsForAsk);
      }
      return buildAskResponse(
          List.of(Map.of("question", "这句我还没编排成具体操作，请再说具体一点。", "options", List.of())),
          actCtx.focus(),
          List.of());
    }

    if (!plan.reply().isEmpty() && plan.calls().isEmpty()) {
      Guardrails.inventoryAuthorityForReply(Map.of());
      return attachDoneReply(plan.reply(), actCtx.focus());
    }

    if (Guardrails.planNeedsUnavailableCapability(plan.calls(), actCtx.catalogMap())) {
      return buildAskResponse(Guardrails.capabilityLimitAsk(), actCtx.focus(), List.of());
    }

    Map<String, Object> inventoryReadReport = null;
    List<Map<String, Object>> readCalls = plan.calls();
    if (isInventoryReadOnlyCalls(readCalls)) {
      inventoryReadReport =
          execute(
              familyId,
              openid,
              actCtx.tree(),
              readCalls,
              actCtx.refs(),
              actCtx.catalogMap(),
              actCtx.today().get("ymd"));
      List<Map<String, Object>> invRows =
          ingestInventoryToProbeRefs(inventoryReadReport, actCtx.tree(), actCtx.refs());
      turnRows.addAll(invRows);
      Map<String, String> vars = new LinkedHashMap<>(actCtx.vars());
      vars.put("probe", ActPrompt.renderProbeRows(invRows));
      String system = replanSystem(actCtx, vars);
      String invNote =
          invRows.isEmpty()
              ? "查询结果：无匹配物资"
              : "查询结果已写入本轮短号：\n" + ActPrompt.renderProbeRows(invRows);
      plan = askPlan(modelOpts, system, actCtx.userText() + "\n" + invNote);
      plan = new ActPlan(plan.ask(), null, plan.calls(), plan.reply());
      if (!plan.ask().isEmpty()) {
        return buildAskResponse(plan.ask(), actCtx.focus(), invRows);
      }
      if (isIdlePlan(plan) || isInventoryReadOnlyCalls(plan.calls())) {
        return buildDonePayload(readCalls, inventoryReadReport, actCtx.focus());
      }
      if (!plan.reply().isEmpty() && plan.calls().isEmpty()) {
        return attachDoneReplyWithReport(plan.reply(), readCalls, inventoryReadReport, actCtx.focus());
      }
      if (Guardrails.planNeedsUnavailableCapability(plan.calls(), actCtx.catalogMap())) {
        return buildAskResponse(Guardrails.capabilityLimitAsk(), actCtx.focus(), List.of());
      }
    }

    var receipts = Receipts.parseLatestQtyChangeReceipts(actCtx.history());
    if (receipts.size() >= 2 && !plan.calls().isEmpty()) {
      final var planCalls = plan.calls();
      final var refs = actCtx.refs();
      boolean needProbe =
          probedRows.isEmpty()
              && receipts.stream()
                  .anyMatch(r -> planCalls.stream().anyMatch(c -> Receipts.callCoversReceipt(c, r, refs)));
      if (needProbe) {
        probedRows =
            itemsProbe.runProbe(
                familyId, actCtx.tree(), Receipts.probeFromReceipts(receipts), refs);
        turnRows.addAll(probedRows);
      }
      plan =
          Receipts.completePartialReceiptRollbacks(
              plan, receipts, refs, probedRows, actCtx.text());
      bindUnresolvedWritesToProbe(plan, refs, probedRows);
    }

    List<Map<String, Object>> confirmCalls =
        Guardrails.needsConfirm(plan.calls(), actCtx.catalogMap());
    if (!confirmCalls.isEmpty() && !confirmed) {
      List<Map<String, Object>> boundPreview = ActRefs.bindCallIds(plan.calls(), actCtx.refs());
      boolean unresolvedMulti =
          boundPreview.stream()
              .anyMatch(
                  c -> {
                    if (c == null) {
                      return false;
                    }
                    String use = String.valueOf(c.get("use"));
                    if (!"item.removeMany".equals(use) && !"item.merge".equals(use)) {
                      return false;
                    }
                    @SuppressWarnings("unchecked")
                    List<String> ids = (List<String>) c.get("itemIds");
                    return ids == null || ids.stream().filter(id -> id != null && !id.isBlank()).count() < 2;
                  });
      if (unresolvedMulti) {
        return buildAskResponse(
            List.of(
                Map.of(
                    "question",
                    "还没法对准要处理的那几条，请再说一下具体是哪几件（或先让我查一下）",
                    "options",
                    List.of())),
            actCtx.focus(),
            probedRows.isEmpty() ? turnRows : probedRows);
      }
      return buildConfirmPayload(plan.calls(), confirmCalls, actCtx.refs(), actCtx.focus(), turnRows);
    }

    if (hasUnresolvedItemWrites(plan, actCtx.refs())) {
      return buildAskResponse(
          List.of(
              Map.of(
                  "question",
                  "还没法对准要改的那几条，请点一条或说下名称和现在数量～",
                  "options",
                  List.of())),
          actCtx.focus(),
          probedRows.isEmpty() ? turnRows : probedRows);
    }

    Map<String, Object> report =
        execute(
            familyId,
            openid,
            actCtx.tree(),
            plan.calls(),
            actCtx.refs(),
            actCtx.catalogMap(),
            actCtx.today().get("ymd"));

    Map<String, Object> finalReport = report;
    List<Map<String, Object>> finalCalls = new ArrayList<>(plan.calls());
    if (Boolean.TRUE.equals(report.get("createClassFailed")) && !Boolean.TRUE.equals(report.get("subscribeUi"))) {
      finalReport = tryReplanCreateFailure(modelOpts, actCtx, plan, report, familyId, openid, confirmed, turnRows);
      if (finalReport.containsKey("__askPayload")) {
        @SuppressWarnings("unchecked")
        Map<String, Object> askPayload = (Map<String, Object>) finalReport.get("__askPayload");
        return askPayload;
      }
      if (finalReport.containsKey("__confirmPayload")) {
        @SuppressWarnings("unchecked")
        Map<String, Object> confirmPayload = (Map<String, Object>) finalReport.get("__confirmPayload");
        return confirmPayload;
      }
      if (finalReport.get("mergedCalls") instanceof List<?> mc) {
        finalCalls = new ArrayList<>();
        for (Object o : mc) {
          if (o instanceof Map<?, ?> m) {
            finalCalls.add((Map<String, Object>) m);
          }
        }
      }
    }

    Map<String, Object> knowledgeDone = tryKnowledgeOnlyFollowUp(modelOpts, actCtx, finalCalls, finalReport);
    if (knowledgeDone != null) {
      return knowledgeDone;
    }
    Map<String, Object> pageDone = tryPageDocFollowUp(modelOpts, actCtx, finalCalls, finalReport, familyId, openid, probedRows);
    if (pageDone != null) {
      return pageDone;
    }

    if (Boolean.TRUE.equals(finalReport.get("subscribeUi"))) {
      return buildSubscribePayload(finalCalls, finalReport, actCtx.focus());
    }

    return buildDonePayload(finalCalls, finalReport, actCtx.focus());
  }

  private ActPlan askPlan(ModelOpts opts, String system, String user) {
    try {
      return actPrompt.askModel(opts, system, user).plan();
    } catch (ActModelException e) {
      throw ApiException.of(e.code(), e.getMessage());
    }
  }

  private String replanSystem(ActContext actCtx, Map<String, String> vars) {
    String systemText =
        String.valueOf(
            actCtx.promptDoc().get("system") != null
                ? actCtx.promptDoc().get("system")
                : AssistPromptTexts.ASSIST_PROMPT_V2);
    return ActPrompt.fillAssistPrompt(systemText, vars);
  }

  private ActPlan recoverIdlePlan(
      ModelOpts modelOpts,
      ActContext actCtx,
      List<Map<String, Object>> probedRows,
      List<Map<String, Object>> turnRows,
      String familyId) {
    Map<String, String> vars = new LinkedHashMap<>(actCtx.vars());
    vars.put("probe", ActPrompt.renderProbeRows(probedRows.isEmpty() ? turnRows : probedRows));
    String idleSystem = replanSystem(actCtx, vars);
    String probeNote =
        probedRows.isEmpty() && turnRows.isEmpty()
            ? "本轮尚无探查结果。"
            : "本轮已有探查/关注行：\n"
                + ActPrompt.renderProbeRows(probedRows.isEmpty() ? turnRows : probedRows);
    ActPlan plan =
        askPlan(
            modelOpts,
            idleSystem,
            actCtx.userText() + "\n（系统：禁止交空计划。缺槽位则 ask。）\n" + probeNote);
    if (plan.probe() != null && probedRows.isEmpty()) {
      probedRows = itemsProbe.runProbe(familyId, actCtx.tree(), plan.probe(), actCtx.refs());
      turnRows.addAll(probedRows);
      Map<String, String> afterVars = new LinkedHashMap<>(actCtx.vars());
      afterVars.put("probe", ActPrompt.renderProbeRows(probedRows));
      String afterSystem = replanSystem(actCtx, afterVars);
      String afterNote =
          probedRows.isEmpty()
              ? "探查结果：无匹配物资"
              : "探查结果：\n" + ActPrompt.renderProbeRows(probedRows);
      plan =
          askPlan(
              modelOpts,
              afterSystem,
              actCtx.userText() + "\n" + afterNote + "\n（系统：禁止空计划。）");
      plan = new ActPlan(plan.ask(), null, plan.calls(), plan.reply());
      bindUnresolvedWritesToProbe(plan, actCtx.refs(), probedRows);
    } else {
      plan = new ActPlan(plan.ask(), null, plan.calls(), plan.reply());
      bindUnresolvedWritesToProbe(plan, actCtx.refs(), probedRows);
    }
    return plan;
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
    return plan.reply().isEmpty();
  }

  private static boolean isInventoryReadOnlyCalls(List<Map<String, Object>> calls) {
    if (calls == null || calls.isEmpty()) {
      return false;
    }
    return calls.stream()
        .allMatch(
            c -> {
              String use = c == null ? "" : String.valueOf(c.get("use")).trim();
              return "item.search".equals(use) || "item.listExpiring".equals(use);
            });
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
          return new ActPlan(plan.ask(), probe, plan.calls(), plan.reply());
        }
        return new ActPlan(plan.ask(), Map.of("listAll", true), plan.calls(), plan.reply());
      }
    }
    return plan;
  }

  private static void bindUnresolvedWritesToProbe(
      ActPlan plan, Map<String, Map<String, Object>> refs, List<Map<String, Object>> probedRows) {
    for (Map<String, Object> call : plan.calls()) {
      if (call == null) {
        continue;
      }
      String use = String.valueOf(call.get("use")).trim();
      if (!"item.update".equals(use) && !"item.remove".equals(use)) {
        continue;
      }
      if (ActRefs.lookupRef(call, refs) != null) {
        continue;
      }
      String name = String.valueOf(call.get("name")).trim();
      Map<String, Object> hit = null;
      if (!name.isEmpty()) {
        List<Map<String, Object>> matches =
            probedRows.stream().filter(r -> name.equals(String.valueOf(r.get("name")))).toList();
        if (matches.size() == 1) {
          hit = matches.get(0);
        }
      } else if (probedRows.size() == 1) {
        hit = probedRows.get(0);
      }
      if (hit != null) {
        call.put("ref", hit.get("ref"));
        if (!call.containsKey("name")) {
          call.put("name", hit.get("name"));
        }
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
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "ask");
    payload.put("ask", PlanParser.enrichAskOptionsFromProbe(ask, probedRows));
    payload.put("probe", null);
    payload.put("calls", List.of());
    payload.put("draft", PlanParser.draftFromCalls(List.of()));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    return payload;
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
      confirmView.add(confirmCallView(call, refs));
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "confirm");
    payload.put("ask", List.of());
    if (removeWarn != null) {
      payload.put("confirmKind", "removeUpdated");
      payload.put("confirmTitle", removeWarn.get("title"));
      payload.put("confirmHint", removeWarn.get("hint"));
    }
    payload.put("confirm", confirmView);
    payload.put("calls", boundCalls);
    payload.put("draft", PlanParser.draftFromCalls(boundCalls));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    return payload;
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
    Presentation.PresentationView p = Presentation.textOnlyPresentation(reply);
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "done");
    payload.put("ask", List.of());
    payload.put("confirm", List.of());
    payload.put("calls", List.of());
    payload.put("report", Map.of("executed", List.of(), "failed", List.of(), "possibleDuplicates", List.of(), "lines", p.lines(), "wrote", false));
    payload.put("draft", PlanParser.draftFromCalls(List.of()));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    return Presentation.attachPresentation(payload, p);
  }

  private Map<String, Object> attachDoneReplyWithReport(
      String reply,
      List<Map<String, Object>> readCalls,
      Map<String, Object> inventoryReadReport,
      Map<String, Object> focus) {
    Presentation.PresentationView p = Presentation.textOnlyPresentation(reply);
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "done");
    payload.put("calls", readCalls);
    payload.put("report", slimReport(inventoryReadReport));
    payload.put("draft", PlanParser.draftFromCalls(List.of()));
    payload.put("focus", focusPublic(focus));
    payload.put("wrote", false);
    return Presentation.attachPresentation(payload, p);
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

  private Map<String, Object> tryReplanCreateFailure(
      ModelOpts modelOpts,
      ActContext actCtx,
      ActPlan plan,
      Map<String, Object> report,
      String familyId,
      String openid,
      boolean confirmed,
      List<Map<String, Object>> turnRows) {
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> treeAfter =
          report.get("tree") instanceof Map<?, ?> t ? (Map<String, Object>) t : actCtx.tree();
      String treeText = FamilyTreeService.renderTreeNames(treeAfter);
      String execText = ActPrompt.renderExecReceipt(report, treeText);
      Map<String, String> vars = new LinkedHashMap<>(actCtx.vars());
      vars.put("tree", treeText);
      vars.put("exec", execText);
      vars.put("probe", vars.getOrDefault("probe", "无"));
      ActPlan nextPlan =
          askPlan(
              modelOpts,
              replanSystem(actCtx, vars),
              actCtx.userText() + "\n（执行回执如下，请只重编排尚未完成的事，勿重复已成功步骤。）\n" + execText);
      if (!nextPlan.ask().isEmpty()) {
        Map<String, Object> askPayload = new LinkedHashMap<>();
        askPayload.put("status", "ask");
        askPayload.put("ask", nextPlan.ask());
        askPayload.put("calls", List.of());
        askPayload.put("draft", PlanParser.draftFromCalls(nextPlan.calls()));
        askPayload.put("focus", focusPublic(actCtx.focus()));
        askPayload.put("wrote", report.get("wrote"));
        askPayload.put("report", slimReport(report));
        return Map.of("__askPayload", askPayload);
      }
      if (!nextPlan.calls().isEmpty()) {
        if (Guardrails.planNeedsUnavailableCapability(nextPlan.calls(), actCtx.catalogMap())) {
          return Map.of(
              "__askPayload",
              buildAskResponse(Guardrails.capabilityLimitAsk(), actCtx.focus(), List.of()));
        }
        List<Map<String, Object>> confirm2 =
            Guardrails.needsConfirm(nextPlan.calls(), actCtx.catalogMap());
        if (!confirm2.isEmpty() && !confirmed) {
          List<Map<String, Object>> touched = new ArrayList<>();
          if (report.get("touched") instanceof List<?> t) {
            for (Object o : t) {
              if (o instanceof Map<?, ?> m) {
                touched.add((Map<String, Object>) m);
              }
            }
          }
          touched.addAll(turnRows);
          return Map.of(
              "__confirmPayload",
              buildConfirmPayload(nextPlan.calls(), confirm2, actCtx.refs(), actCtx.focus(), touched));
        }
        Map<String, Object> second =
            execute(
                familyId,
                openid,
                treeAfter,
                nextPlan.calls(),
                actCtx.refs(),
                actCtx.catalogMap(),
                actCtx.today().get("ymd"));
        Map<String, Object> merged = mergeCreateReports(report, second);
        merged.put("mergedCalls", concatCalls(plan.calls(), nextPlan.calls()));
        return merged;
      }
    } catch (Exception e) {
      log.warn("act replan failed {}", e.getMessage());
    }
    return report;
  }

  private Map<String, Object> tryKnowledgeOnlyFollowUp(
      ModelOpts modelOpts, ActContext actCtx, List<Map<String, Object>> finalCalls, Map<String, Object> finalReport) {
    if (!isKnowledgeOnlyReport(finalReport)) {
      return null;
    }
    String knowledgeText = collectKnowledgeBodies(finalReport);
    Map<String, String> vars = new LinkedHashMap<>(actCtx.vars());
    vars.put("knowledge", knowledgeText.isEmpty() ? "无" : knowledgeText);
    vars.put("probe", vars.getOrDefault("probe", "无"));
    vars.put("exec", "无");
    String replyText = "";
    try {
      ActPlan second =
          askPlan(
              modelOpts,
              replanSystem(actCtx, vars),
              actCtx.userText() + "\n（系统已取回知识正文。）\n知识正文：\n" + knowledgeText);
      replyText = second.reply().trim();
      if (replyText.isEmpty() && !second.ask().isEmpty()) {
        replyText = String.valueOf(second.ask().get(0).get("question")).trim();
      }
    } catch (Exception e) {
      log.warn("act knowledge reply failed {}", e.getMessage());
    }
    if (replyText.isEmpty()) {
      replyText = knowledgeFallbackText(finalReport);
    }
    if (replyText.isEmpty()) {
      return null;
    }
    return attachDoneReply(replyText, actCtx.focus());
  }

  private Map<String, Object> tryPageDocFollowUp(
      ModelOpts modelOpts,
      ActContext actCtx,
      List<Map<String, Object>> finalCalls,
      Map<String, Object> finalReport,
      String familyId,
      String openid,
      List<Map<String, Object>> probedRows) {
    if (!isPageDocOnlyReport(finalReport)) {
      return null;
    }
    String pageText = collectPageBodies(finalReport);
    Map<String, String> vars = new LinkedHashMap<>(actCtx.vars());
    vars.put("probe", vars.getOrDefault("probe", "无"));
    vars.put("exec", "无");
    try {
      ActPlan nextPlan =
          askPlan(
              modelOpts,
              replanSystem(actCtx, vars),
              actCtx.userText() + "\n（系统已取回产品页说明。禁止臆造 path。）\n页面说明：\n" + pageText);
      if (!nextPlan.ask().isEmpty()) {
        return buildAskResponse(nextPlan.ask(), actCtx.focus(), probedRows);
      }
      List<Map<String, Object>> nextCalls =
          nextPlan.calls().stream().filter(c -> "page.get".equals(String.valueOf(c.get("use")))).toList();
      if (!nextCalls.isEmpty()) {
        Map<String, Object> secondReport =
            execute(
                familyId,
                openid,
                finalReport.get("tree") instanceof Map<?, ?> t ? (Map<String, Object>) t : actCtx.tree(),
                nextCalls,
                actCtx.refs(),
                actCtx.catalogMap(),
                actCtx.today().get("ymd"));
        mergeCreateReports(finalReport, secondReport);
        return null;
      }
      String reply = nextPlan.reply().trim();
      if (reply.isEmpty()) {
        reply = pageFallbackText(finalReport);
      }
      if (!reply.isEmpty()) {
        return attachDoneReply(reply, actCtx.focus());
      }
    } catch (Exception e) {
      log.warn("act page reply failed {}", e.getMessage());
    }
    return null;
  }

  @SuppressWarnings("unchecked")
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
    List<String> lines =
        presentation.lines().isEmpty() ? List.of("没有需要执行的操作") : presentation.lines();
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
