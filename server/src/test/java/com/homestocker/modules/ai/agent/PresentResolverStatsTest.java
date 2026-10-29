package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Regression: stats + source=inventory must read item.stats buckets, not only inventory rows. */
class PresentResolverStatsTest {

  @Test
  void statsFromInventorySourceUsesStatsBuckets() {
    Map<String, Object> report =
        Map.of(
            "executed",
            List.of(
                Map.of(
                    "use",
                    "item.stats",
                    "stats",
                    Map.of(
                        "totalItems",
                        27,
                        "groupBy",
                        "space",
                        "buckets",
                        List.of(
                            Map.of("label", "客厅", "value", 9L),
                            Map.of("label", "厨房", "value", 8L),
                            Map.of("label", "仓库", "value", 8L))))));

    Map<String, Object> raw =
        Map.of(
            "type", "stats",
            "source", "inventory",
            "groupBy", "space",
            "title", "家里物资分布");

    Map<String, Object> present = PresentResolver.resolve(raw, List.of(), report);
    assertNotNull(present);
    assertEquals("stats", present.get("type"));
    assertEquals("家里物资分布", present.get("title"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) present.get("items");
    assertNotNull(items);
    assertTrue(items.size() >= 3);
    assertEquals("客厅", items.get(0).get("label"));
  }

  /**
   * 回归：「家里有什么」先 item.stats（97 条 / 南次卧 41 / 厨房 35），本轮又顺手查了 7 行临期，
   * 卡片曾把这 7 行聚合成「厨房 7 · 100%」，和正文自相矛盾。有 stats 桶时以桶为准。
   */
  @Test
  void statsBucketsWinOverStaleTurnRows() {
    List<Map<String, Object>> turnRows = new java.util.ArrayList<>();
    for (int i = 1; i <= 7; i++) {
      turnRows.add(
          Map.of(
              "ref", "P" + i,
              "name", "临期" + i,
              "quantity", 1,
              "unit", "件",
              "spaceName", "厨房"));
    }
    Map<String, Object> report =
        Map.of(
            "executed",
            List.of(
                Map.of(
                    "use",
                    "item.stats",
                    "stats",
                    Map.of(
                        "totalItems",
                        97,
                        "groupBy",
                        "space",
                        "buckets",
                        List.of(
                            Map.of("label", "南次卧", "value", 41L),
                            Map.of("label", "厨房", "value", 35L),
                            Map.of("label", "客厅", "value", 21L))))));

    Map<String, Object> raw =
        Map.of("type", "stats", "source", "probe", "groupBy", "space", "title", "各空间物资记录数");

    Map<String, Object> present = PresentResolver.resolve(raw, turnRows, report);
    assertNotNull(present);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) present.get("items");
    assertEquals(3, items.size());
    assertEquals("南次卧", items.get(0).get("label"));
    assertEquals(41, ((Number) items.get(0).get("value")).intValue());
    assertEquals(35, ((Number) items.get(1).get("value")).intValue());
  }

  @Test
  void statsWithoutGroupByUsesItemRowsInsteadOfSpaces() {
    List<Map<String, Object>> rows =
        List.of(
            Map.of("name", "牛奶", "quantity", 2, "unit", "瓶", "spaceName", "冰箱"),
            Map.of("name", "大米", "quantity", 1, "unit", "袋", "spaceName", "仓库"));
    Map<String, Object> raw = Map.of("type", "stats", "source", "probe", "title", "家里台账");

    Map<String, Object> present = PresentResolver.resolve(raw, rows, Map.of());

    assertNotNull(present);
    assertEquals("table", present.get("type"));
    @SuppressWarnings("unchecked")
    List<List<String>> tableRows = (List<List<String>>) present.get("rows");
    assertEquals("牛奶", tableRows.get(0).get(0));
    assertEquals("大米", tableRows.get(1).get(0));
  }
}
