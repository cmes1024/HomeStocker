package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ActPromptHistoryTest {

  private static final long NOW = 1_700_000_000_000L;
  private static final long HOUR = 60L * 60L * 1000L;

  @Test
  void keepsPreviousSessionAndMarksTheGap() {
    List<Map<String, Object>> raw =
        List.of(
            turn("user", "牛奶用完了", NOW - 3 * HOUR),
            turn("assistant", "牛奶已改 2→0", NOW - 3 * HOUR + 5_000),
            turn("user", "记一盒鸡蛋", NOW - 5 * 60_000L));

    List<Map<String, String>> kept = ActPrompt.sanitizeHistory(raw);
    assertEquals(3, kept.size());

    List<Map<String, String>> model = ActPrompt.historyForModel(kept, NOW);
    assertEquals("牛奶用完了", model.get(0).get("text"));
    assertEquals("system", model.get(2).get("role"));
    assertEquals(true, model.get(2).get("text").contains("时间间隔"));
    assertEquals("记一盒鸡蛋", model.get(3).get("text"));
  }

  @Test
  void noGapNoteInsideTheSameSession() {
    List<Map<String, String>> history =
        ActPrompt.sanitizeHistory(
            List.of(
                turn("user", "看看冰箱", NOW - 20 * 60_000L),
                turn("assistant", "冰箱里有鸡蛋", NOW - 19 * 60_000L)));

    List<Map<String, String>> model = ActPrompt.historyForModel(history, NOW);
    assertEquals(2, model.size());
    assertFalse(model.stream().anyMatch(row -> "system".equals(row.get("role"))));
  }

  @Test
  void marksGapWhenTheWholeHistoryIsStale() {
    List<Map<String, String>> history =
        ActPrompt.sanitizeHistory(List.of(turn("user", "昨天的事", NOW - 5 * HOUR)));

    List<Map<String, String>> model = ActPrompt.historyForModel(history, NOW);
    assertEquals(2, model.size());
    assertEquals("昨天的事", model.get(0).get("text"));
    assertEquals("system", model.get(1).get("role"));
  }

  private static Map<String, Object> turn(String role, String text, long at) {
    return Map.of("role", role, "text", text, "at", Long.toString(at));
  }
}
