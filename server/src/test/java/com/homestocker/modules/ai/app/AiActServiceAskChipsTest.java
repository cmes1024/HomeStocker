package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AiActServiceAskChipsTest {

  @Test
  void degradeAskIsBoundary() {
    assertTrue(AiActService.isBoundaryAsk(List.of(ask(AssistPromptTexts.DEGRADE_ASK))));
  }

  @Test
  void capabilityLimitAndOutOfScopeAreBoundary() {
    assertTrue(AiActService.isBoundaryAsk(List.of(ask(AssistPromptTexts.CAPABILITY_LIMIT_ASK))));
    assertTrue(AiActService.isBoundaryAsk(List.of(ask(AssistPromptTexts.OUT_OF_SCOPE_ASK))));
  }

  @Test
  void realQuestionIsNotBoundary() {
    assertFalse(AiActService.isBoundaryAsk(List.of(ask("您指哪一条？"))));
  }

  @Test
  void optionsOnlyRowIsNotBoundary() {
    assertFalse(AiActService.isBoundaryAsk(List.of(ask(""))));
  }

  private static Map<String, Object> ask(String question) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("question", question);
    row.put("options", List.of());
    return row;
  }
}
