package com.homestocker.modules.ai.agent;

import com.homestocker.modules.ai.app.AiSeedService;
import com.homestocker.modules.ai.app.CapabilityCatalog;
import com.homestocker.modules.ai.knowledge.KnowledgeService;
import com.homestocker.modules.family.app.FamilyTreeService;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.infra.jdbc.FamilyRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Port of agent/context.js */
@Component
public class ActContextBuilder {

  private final AiSeedService aiSeedService;
  private final FamilyTreeService familyTreeService;
  private final FamilyRepository familyRepository;
  private final ItemsProbe itemsProbe;
  private final KnowledgeService knowledgeService;

  public ActContextBuilder(
      AiSeedService aiSeedService,
      FamilyTreeService familyTreeService,
      FamilyRepository familyRepository,
      ItemsProbe itemsProbe,
      KnowledgeService knowledgeService) {
    this.aiSeedService = aiSeedService;
    this.familyTreeService = familyTreeService;
    this.familyRepository = familyRepository;
    this.itemsProbe = itemsProbe;
    this.knowledgeService = knowledgeService;
  }

  public record ActContext(
      String openid,
      String familyId,
      Map<String, Map<String, Object>> catalogMap,
      Map<String, Object> promptDoc,
      Map<String, Object> tree,
      String familyName,
      Map<String, String> today,
      Map<String, Map<String, Object>> refs,
      List<Map<String, String>> history,
      Map<String, Object> focus,
      List<Map<String, Object>> turnRows,
      Map<String, String> vars,
      String system,
      String text,
      String userText) {}

  @SuppressWarnings("unchecked")
  public ActContext build(String openid, Map<String, Object> event, String familyId) {
    Map<String, Object> catalog = aiSeedService.ensureCapabilities();
    Map<String, Object> promptDoc = aiSeedService.ensurePrompt();
    Map<String, Object> tree = familyTreeService.getOrRebuild(familyId);
    String familyName =
        familyRepository
            .findById(familyId)
            .map(f -> f.name() == null || f.name().isBlank() ? "家庭" : f.name())
            .orElse("家庭");
    Map<String, String> today =
        Map.of("ymd", ShanghaiDates.todayYmd(), "weekday", ShanghaiDates.todayWeekdayCn());
    Map<String, Map<String, Object>> catalogMap = enabledMap(catalog);
    Map<String, Map<String, Object>> refs = new LinkedHashMap<>();

    List<Map<String, String>> history = ActPrompt.sanitizeHistory(event.get("history"));
    String focusItemId = event.get("focusItemId") == null ? "" : String.valueOf(event.get("focusItemId"));
    Map<String, Object> focus = itemsProbe.loadFocus(familyId, tree, focusItemId.trim());
    if (focus != null) {
      refs.put(String.valueOf(focus.get("ref")), focus);
    }

    Map<String, String> vars = new LinkedHashMap<>();
    vars.put("today", today.get("ymd"));
    vars.put("weekday", today.get("weekday"));
    vars.put("familyName", familyName);
    vars.put("capabilities", CapabilityCatalog.renderCapabilities(catalog));
    vars.put("tree", FamilyTreeService.renderTreeNames(tree));
    vars.put("history", ActPrompt.renderHistory(history));
    vars.put(
        "focus",
        ActRefs.renderFocusList(focus != null ? List.of(focus) : List.of()));
    vars.put("probe", "无");
    vars.put("exec", "无");
    vars.put("knowledgeIndex", knowledgeService.renderIndex());
    vars.put("knowledge", "无");

    String systemText =
        String.valueOf(
            promptDoc.get("system") != null
                ? promptDoc.get("system")
                : com.homestocker.modules.ai.app.AssistPromptTexts.ASSIST_PROMPT_V2);
    String system = ActPrompt.fillAssistPrompt(systemText, vars);
    String text = event.get("text") == null ? "" : String.valueOf(event.get("text")).trim();
    String userText =
        focus != null
            ? text + "\n（当前关注短号 " + focus.get("ref") + "：" + focus.get("name") + "）"
            : text;

    return new ActContext(
        openid,
        familyId,
        catalogMap,
        promptDoc,
        tree,
        familyName,
        today,
        refs,
        history,
        focus,
        new ArrayList<>(),
        vars,
        system,
        text,
        userText);
  }

  private static Map<String, Map<String, Object>> enabledMap(Map<String, Object> catalog) {
    Map<String, Map<String, Object>> map = new LinkedHashMap<>();
    for (Map<String, Object> api : CapabilityCatalog.enabledApis(catalog)) {
      map.put(String.valueOf(api.get("id")), api);
    }
    return map;
  }
}
