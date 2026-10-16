package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WriteGroundingTest {

  private final Map<String, Object> tree =
      Map.of(
          "spaces",
          List.of(
              Map.of("name", "厨房", "locations", List.of(Map.of("name", "冰箱"), Map.of("name", "橱柜"))),
              Map.of("name", "客厅", "locations", List.of())));

  @Test
  void twoMilksNeedAPlaceBeforeEitherIsChanged() {
    List<Map<String, Object>> rows =
        List.of(milk("P1", "2", "冰箱", ""), milk("P2", "1", "", "常温未开"));
    String why =
        WriteGrounding.blocked(
            "牛奶和酸奶各喝一盒", "", tree, rows, Map.of("use", "item.update", "ref", "P1", "quantity", 1));
    assertTrue(why.contains("哪一条"));
  }

  @Test
  void fridgeInTheSentenceSelectsThatMilk() {
    List<Map<String, Object>> rows =
        List.of(milk("P1", "2", "冰箱", ""), milk("P2", "1", "", "常温未开"));
    assertNull(
        WriteGrounding.blocked(
            "牛奶我从冰箱拿了一盒喝了",
            "",
            tree,
            rows,
            Map.of("use", "item.update", "ref", "P1", "quantity", 1)));
  }

  @Test
  void inventedHalfBoxIsRejected() {
    List<Map<String, Object>> rows = List.of(milk("P2", "1", "", "常温未开"));
    String why =
        WriteGrounding.blocked(
            "常温那盒，没开封那盒",
            "",
            tree,
            rows,
            Map.of("use", "item.update", "ref", "P2", "quantity", new BigDecimal("0.5")));
    assertTrue(why.contains("数量"));
  }

  @Test
  void saidQuantityStillWrites() {
    List<Map<String, Object>> rows = List.of(Map.of("ref", "P1", "itemId", "a", "name", "苹果", "quantity", 2, "spaceName", "厨房", "locationName", "冰箱", "note", ""));
    assertNull(
        WriteGrounding.blocked(
            "先把苹果改成3", "", tree, rows, Map.of("use", "item.update", "ref", "P1", "quantity", 3)));
  }

  @Test
  void movingKeysOntoANewHookDoesNotInventTheLivingRoom() {
    List<Map<String, Object>> rows =
        List.of(
            Map.of(
                "ref", "P1",
                "itemId", "k",
                "name", "钥匙",
                "quantity", 1,
                "spaceName", "客厅",
                "locationName", "",
                "note", ""));
    String why =
        WriteGrounding.blocked(
            "钥匙放到玄关那个挂钩上",
            "",
            tree,
            rows,
            Map.of("use", "item.update", "ref", "P1", "spaceName", "客厅", "locationName", "玄关挂钩"));
    assertTrue(why.contains("客厅") || why.contains("玄关"));
  }

  @Test
  void keepingUntilTomorrowDoesNotSetAnExpiry() {
    List<Map<String, Object>> rows =
        List.of(Map.of("ref", "P1", "itemId", "y", "name", "酸奶", "quantity", 2, "spaceName", "厨房", "locationName", "冰箱", "note", ""));
    String why =
        WriteGrounding.blocked(
            "酸奶留到明天，数量别变",
            "",
            tree,
            rows,
            Map.of("use", "item.update", "ref", "P1", "expireDate", "2026-10-17"));
    assertTrue(why.contains("日期"));
  }

  @Test
  void worryingIsNotATag() {
    List<Map<String, Object>> rows =
        List.of(Map.of("ref", "P1", "itemId", "d", "name", "纸尿裤", "quantity", 1, "spaceName", "宝宝房", "locationName", "", "note", ""));
    String why =
        WriteGrounding.blocked(
            "宝宝房纸尿裤我怕忘了带",
            "",
            tree,
            rows,
            Map.of("use", "item.update", "ref", "P1", "tagNames", List.of("宝宝")));
    assertTrue(why.contains("标签"));
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
