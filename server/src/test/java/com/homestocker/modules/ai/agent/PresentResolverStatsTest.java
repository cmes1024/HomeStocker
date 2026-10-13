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
