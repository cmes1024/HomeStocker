package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ToolFeedbackTest {

  @Test
  void carriesCodeFieldGivenAndCandidates() {
    String json =
        ToolFeedback.of(GroundingCodes.REF_AMBIGUOUS, "name", "酱油")
            .withCandidates(List.of("P1 酱油 1瓶 厨房/橱柜", "P2 酱油 1瓶 厨房/冰箱"))
            .toJson();
    assertTrue(json.contains("\"ok\":false"));
    assertTrue(json.contains("\"code\":\"REF_AMBIGUOUS\""));
    assertTrue(json.contains("\"field\":\"name\""));
    assertTrue(json.contains("\"given\":\"酱油\""));
    assertTrue(json.contains("P1 酱油"));
    assertTrue(json.contains("P2 酱油"));
  }

  @Test
  void keepsDeclaredOriginAndQuote() {
    String json =
        ToolFeedback.of(GroundingCodes.PLACE_UNGROUNDED, "spaceName", "厨房")
            .declared("user")
            .quoted("放一起")
            .toJson();
    assertTrue(json.contains("\"declared\":\"user\""));
    assertTrue(json.contains("\"quote\":\"放一起\""));
  }

  @Test
  void neverExceedsCharBudget() {
    List<String> candidates = new ArrayList<>();
    for (int i = 0; i < 20; i++) {
      candidates.add("P" + i + " 某某某某某某某某某某某某某某某某 99瓶 某某空间/某某位置");
    }
    String json =
        ToolFeedback.of(GroundingCodes.REF_AMBIGUOUS, "name", "某某某某某某某某某某某某")
            .declared("inference")
            .quoted("这是家人说的一句相当长的话用来撑爆字符上限")
            .withCandidates(candidates)
            .toJson();
    assertTrue(json.length() <= ToolFeedback.MAX_CHARS, "len=" + json.length());
    assertTrue(json.startsWith("{\"ok\":false"));
    assertTrue(json.endsWith("}"));
  }

  @Test
  void candidatesAreCappedAtFive() {
    List<String> candidates = new ArrayList<>();
    for (int i = 0; i < 9; i++) {
      candidates.add("P" + i);
    }
    String json = ToolFeedback.of(GroundingCodes.REF_UNKNOWN, "ref", "P9").withCandidates(candidates).toJson();
    assertFalse(json.contains("P5"));
    assertTrue(json.contains("P4"));
  }

  @Test
  void noChineseInstructionSentence() {
    String json =
        ToolFeedback.of(GroundingCodes.PLACE_UNGROUNDED, "spaceName", "厨房")
            .withCandidates(List.of("厨房", "客厅"))
            .toJson();
    assertFalse(json.contains("先问"));
    assertFalse(json.contains("不要"));
    assertFalse(json.contains("请"));
  }
}
