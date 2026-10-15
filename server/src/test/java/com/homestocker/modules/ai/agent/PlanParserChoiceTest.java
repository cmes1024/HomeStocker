package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PlanParserChoiceTest {

  @Test
  void choiceLinesDropInventedQuantityAndBecomeChips() {
    List<Map<String, Object>> shown =
        PlanParser.presentChoiceAsks(
            List.of(
                ask("记1盒，放冰箱"),
                ask("记1盒，放仓库"),
                ask("先不记")));
    assertEquals(1, shown.size());
    assertEquals("", shown.get(0).get("question"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> options = (List<Map<String, Object>>) shown.get(0).get("options");
    assertEquals(List.of("放冰箱", "放仓库", "先不记"), options.stream().map(o -> o.get("label")).toList());
  }

  @Test
  void inventoryLabelKeepsRealQuantity() {
    assertEquals("苹果 2斤（冰箱）", PlanParser.stripInventedQuantity("苹果 2斤（冰箱）"));
  }

  @Test
  void proseQuestionKeepsItsWording() {
    List<Map<String, Object>> shown =
        PlanParser.presentChoiceAsks(List.of(ask("记1盒/瓶牛奶，放哪儿？", List.of("放冰箱", "先不记"))));
    assertEquals("记1盒/瓶牛奶，放哪儿？", shown.get(0).get("question"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> options = (List<Map<String, Object>>) shown.get(0).get("options");
    assertEquals("放冰箱", options.get(0).get("label"));
    assertTrue(options.stream().noneMatch(o -> String.valueOf(o.get("label")).contains("盒")));
  }

  private static Map<String, Object> ask(String question) {
    return ask(question, List.of());
  }

  private static Map<String, Object> ask(String question, List<String> labels) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("question", question);
    row.put(
        "options",
        labels.stream()
            .map(
                label -> {
                  Map<String, Object> opt = new LinkedHashMap<>();
                  opt.put("label", label);
                  opt.put("value", label);
                  return opt;
                })
            .toList());
    return row;
  }
}
