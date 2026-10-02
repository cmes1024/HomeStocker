package com.homestocker.modules.ai.habits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HabitObserveServiceTest {

  @Test
  void strongDefaultSpaceNeedsThreeAndShare() {
    List<Map<String, Object>> writes = new ArrayList<>();
    writes.add(write("create", "牛奶", "客厅", "", ""));
    writes.add(write("create", "面包", "客厅", "", ""));
    Map<String, Object> weak =
        HabitObserveService.aggregateFromWrites(writes);
    @SuppressWarnings("unchecked")
    Map<String, Object> candWeak = (Map<String, Object>) weak.get("defaultSpaceCandidate");
    assertFalse(Boolean.TRUE.equals(candWeak.get("strong")));

    writes.add(write("create", "纸巾", "客厅", "", ""));
    Map<String, Object> strong = HabitObserveService.aggregateFromWrites(writes);
    @SuppressWarnings("unchecked")
    Map<String, Object> candStrong = (Map<String, Object>) strong.get("defaultSpaceCandidate");
    assertEquals("客厅", candStrong.get("spaceName"));
    assertTrue(Boolean.TRUE.equals(candStrong.get("strong")));
  }

  private static Map<String, Object> write(
      String kind, String name, String space, String loc, String unit) {
    return Map.of(
        "kind", kind,
        "name", name,
        "itemName", name,
        "spaceName", space,
        "locationName", loc,
        "unit", unit);
  }
}
