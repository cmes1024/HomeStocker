package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.modules.ai.app.AssistPromptTexts;
import com.homestocker.modules.ai.app.CapabilityCatalog;
import com.homestocker.modules.ai.habits.HabitSlots;
import com.homestocker.modules.ai.knowledge.KnowledgePack;
import com.homestocker.modules.ai.knowledge.KnowledgePacks;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * 上线前必跑：只守护跨模块契约，不依赖数据库、网络或模型。
 * 命令：mvn -Dtest=ReleaseRegressionTest test
 */
class ReleaseRegressionTest {

  @Test
  void habitRenderingStaysParseableByPlaceGrounding() {
    String plain = "- 默认落点(default_space；服务端执行，缺落点时可补 spaceName)：客厅";
    assertEquals("客厅", PlaceGrounding.habitDefaultSpace(plain));

    String annotated =
        "- 默认落点(default_space；服务端执行，缺落点时可补 spaceName)：客厅"
            + "（非纯空间名，记一笔时勿直接当 spaceName；应拆成空间名 + 其它槽重记）";
    assertEquals("客厅", PlaceGrounding.habitDefaultSpace(annotated));

    assertEquals("", PlaceGrounding.habitDefaultSpace("无"));
    assertEquals("", PlaceGrounding.habitDefaultSpace(null));
  }

  @Test
  void onlyDefaultSpaceIsEnforcedByServer() {
    assertTrue(HabitSlots.serverExecuted(HabitSlots.DEFAULT_SPACE));
    for (String slot : HabitSlots.all()) {
      if (!HabitSlots.DEFAULT_SPACE.equals(slot)) {
        assertFalse(HabitSlots.serverExecuted(slot), slot);
      }
    }
  }

  @Test
  void onlyDuplicateNameIsUnsupported() {
    assertTrue(HabitSlots.unsupported(HabitSlots.DUPLICATE_NAME));
    for (String slot : HabitSlots.all()) {
      if (!HabitSlots.DUPLICATE_NAME.equals(slot)) {
        assertFalse(HabitSlots.unsupported(slot), slot);
      }
    }
  }

  @Test
  void enforceNoteNeverBreaksColonParsing() {
    for (String slot : HabitSlots.all()) {
      String note = HabitSlots.enforceNote(slot);
      assertFalse(note.contains("："), slot);
      assertFalse(note.contains(":"), slot);
    }
  }

  @Test
  void promptCarriesHabitEnforcementContract() {
    assertTrue(AssistPromptTexts.ASSIST_PROMPT_VERSION >= 69);
    assertTrue(AssistPromptTexts.ASSIST_PROMPT_V2.contains("{{HABITS}}"));
    assertTrue(AssistPromptTexts.ASSIST_PROMPT_V2.contains("仅供措辞"));
    assertFalse(AssistPromptTexts.ASSIST_PROMPT_V2.contains("appliedHabits"));
  }

  @Test
  void knowledgePacksDoNotPromiseRetiredFields() {
    for (KnowledgePack pack : KnowledgePacks.all()) {
      String body = pack.body() == null ? "" : pack.body();
      assertFalse(body.contains("appliedHabits"), pack.topicId());
    }
  }

  @Test
  void capabilitySeedExposesHabitToolsWithKnownSlots() {
    Map<String, Map<String, Object>> apis = new LinkedHashMap<>();
    for (Map<String, Object> api : CapabilityCatalog.seedApis()) {
      apis.put(String.valueOf(api.get("id")), api);
    }
    for (String id : List.of("habit.list", "habit.observe", "habit.upsert", "habit.remove")) {
      Map<String, Object> api = apis.get(id);
      assertNotNull(api, id);
      assertEquals(Boolean.TRUE, api.get("enabled"), id);
      assertFalse(CapabilityCatalog.isHardDenied(id), id);
    }
    String hint = String.valueOf(apis.get("habit.upsert").get("hint"));
    for (String slot : HabitSlots.all()) {
      assertTrue(hint.contains(slot), slot);
    }
  }

  /** 步数上限以 openspec/changes/ai-act-tool-loop/design.md 的「步数上限 4」为准，改动须先改规格。 */
  @Test
  void toolLoopStepCapMatchesSpec() {
    assertEquals(4, ToolSchemas.MAX_STEPS);
  }
}
