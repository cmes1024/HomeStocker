package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WriteGroundingTest {

  @Test
  void twoMilksByNameNeedAPlaceBeforeEitherIsChanged() {
    List<Map<String, Object>> rows =
        List.of(milk("P1", "2", "冰箱", ""), milk("P2", "1", "", "常温未开"));
    ToolFeedback why =
        WriteGrounding.check(
            "牛奶和酸奶各喝一盒",
            rows,
            Map.of("use", "item.update", "name", "牛奶", "quantity", 1));
    assertEquals(GroundingCodes.REF_AMBIGUOUS, why.code());
    assertEquals("name", why.field());
    assertEquals("牛奶", why.given());
    assertEquals(2, why.candidates().size());
  }

  @Test
  void refFromThisTurnPointsAtWhichOne() {
    List<Map<String, Object>> rows =
        List.of(milk("P1", "2", "冰箱", ""), milk("P2", "1", "", "常温未开"));
    assertNull(
        WriteGrounding.check(
            "牛奶改成一盒", rows, Map.of("use", "item.update", "ref", "P2", "quantity", 1)));
  }

  @Test
  void fridgeInTheSentenceSelectsThatMilk() {
    List<Map<String, Object>> rows =
        List.of(milk("P1", "2", "冰箱", ""), milk("P2", "1", "", "常温未开"));
    assertNull(
        WriteGrounding.check(
            "牛奶我从冰箱拿了一盒喝了",
            rows,
            Map.of("use", "item.update", "ref", "P1", "quantity", 1)));
  }

  @Test
  void removingMoreThanStockIsRejected() {
    List<Map<String, Object>> rows = List.of(milk("P1", "1", "冰箱", ""));
    ToolFeedback why =
        WriteGrounding.check("三盒牛奶都扔了", rows, Map.of("use", "item.remove", "ref", "P1"));
    assertEquals(GroundingCodes.QTY_UNGROUNDED, why.code());
    assertEquals("quantity", why.field());
    assertTrue(why.candidates().get(0).contains("牛奶"));
  }

  @Test
  void removingExactlyStockPasses() {
    List<Map<String, Object>> rows = List.of(milk("P1", "1", "冰箱", ""));
    assertNull(
        WriteGrounding.check("一盒牛奶都扔了", rows, Map.of("use", "item.remove", "ref", "P1")));
  }

  @Test
  void removingAnotherObjectsNumberIsNotCounted() {
    List<Map<String, Object>> rows =
        List.of(item("P1", "苹果", "2", "冰箱", ""), item("P2", "电脑", "1", "客厅", ""));
    assertNull(
        WriteGrounding.check(
            "先把苹果改成3，再把电脑删掉", rows, Map.of("use", "item.remove", "ref", "P2")));
  }

  @Test
  void numberBelongsToTheLongerNameNotThisOne() {
    List<Map<String, Object>> rows =
        List.of(item("P1", "大米", "2", "橱柜", ""), item("P2", "米", "1", "橱柜", ""));
    assertNull(
        WriteGrounding.check(
            "先把大米改成2袋，再把米删掉", rows, Map.of("use", "item.remove", "ref", "P2")));
  }

  @Test
  void numberInTheSameClauseStillCounts() {
    List<Map<String, Object>> rows = List.of(item("P1", "牛奶", "1", "冰箱", ""));
    ToolFeedback why =
        WriteGrounding.check(
            "牛奶两盒都扔了", rows, Map.of("use", "item.remove", "ref", "P1"));
    assertEquals(GroundingCodes.QTY_UNGROUNDED, why.code());
  }

  @Test
  void quantityAndDatesAndTagsAreNoLongerJudgedHere() {
    List<Map<String, Object>> rows = List.of(milk("P1", "1", "冰箱", ""));
    assertNull(
        WriteGrounding.check(
            "常温那盒，没开封那盒",
            rows,
            Map.of("use", "item.update", "ref", "P1", "quantity", new BigDecimal("0.5"))));
    assertNull(
        WriteGrounding.check(
            "酸奶留到明天，数量别变",
            rows,
            Map.of("use", "item.update", "ref", "P1", "expireDate", "2026-10-17")));
    assertNull(
        WriteGrounding.check(
            "纸尿裤我怕忘了带", rows, Map.of("use", "item.update", "ref", "P1", "tagNames", List.of("宝宝"))));
  }

  private static Map<String, Object> item(
      String ref, String name, String quantity, String location, String note) {
    return Map.of(
        "ref", ref,
        "itemId", ref,
        "name", name,
        "quantity", new BigDecimal(quantity),
        "spaceName", "厨房",
        "locationName", location,
        "note", note);
  }

  private static Map<String, Object> milk(String ref, String quantity, String location, String note) {
    return Map.of(
        "ref", ref,
        "itemId", ref,
        "name", "牛奶",
        "quantity", new BigDecimal(quantity),
        "spaceName", "厨房",
        "locationName", location,
        "note", note);
  }
}
