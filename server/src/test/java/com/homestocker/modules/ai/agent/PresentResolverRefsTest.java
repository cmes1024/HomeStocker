package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * 回归：「有吃的吗」把厨房 28 行（含锅）整套铺出来。
 *
 * <p>模型只能选「画哪几行」（refs），行内容仍由服务端取；不传 refs 时保持原行为画本轮全部行。
 */
class PresentResolverRefsTest {

  private static List<Map<String, Object>> rows() {
    return List.of(
        Map.of("ref", "P1", "name", "柠檬茶", "quantity", 10, "unit", "瓶", "spaceName", "客厅"),
        Map.of("ref", "P2", "name", "糯米", "quantity", 1, "unit", "袋", "spaceName", "厨房"),
        Map.of("ref", "P3", "name", "酱油", "quantity", 1, "unit", "瓶", "spaceName", "厨房"),
        Map.of("ref", "P4", "name", "鸳鸯锅", "quantity", 1, "unit", "个", "spaceName", "厨房"));
  }

  @Test
  void tableDrawsOnlyChosenRefsInGivenOrder() {
    Map<String, Object> raw =
        Map.of(
            "type", "table",
            "source", "probe",
            "refs", List.of("p1", "P4"),
            "columns", List.of("名称", "数量", "位置"));

    Map<String, Object> present = PresentResolver.resolve(raw, rows(), Map.of());
    assertNotNull(present);
    @SuppressWarnings("unchecked")
    List<List<String>> tableRows = (List<List<String>>) present.get("rows");
    assertEquals(2, tableRows.size());
    assertEquals("柠檬茶", tableRows.get(0).get(0));
    assertEquals("鸳鸯锅", tableRows.get(1).get(0));
  }

  @Test
  void statsCountsChosenRefsNotWholeTurn() {
    Map<String, Object> raw =
        Map.of(
            "type", "stats",
            "source", "probe",
            "groupBy", "space",
            "refs", List.of("P2", "P3"));

    Map<String, Object> present = PresentResolver.resolve(raw, rows(), Map.of());
    assertNotNull(present);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) present.get("items");
    assertEquals(1, items.size());
    assertEquals("厨房", items.get(0).get("label"));
    assertEquals(2, ((Number) items.get(0).get("value")).intValue());
  }

  @Test
  void unknownRefsFallBackToWholeTurn() {
    Map<String, Object> raw =
        Map.of(
            "type", "table",
            "source", "probe",
            "refs", List.of("P99"),
            "columns", List.of("名称"));

    Map<String, Object> present = PresentResolver.resolve(raw, rows(), Map.of());
    assertNotNull(present);
    @SuppressWarnings("unchecked")
    List<List<String>> tableRows = (List<List<String>>) present.get("rows");
    assertEquals(4, tableRows.size());
  }
}
