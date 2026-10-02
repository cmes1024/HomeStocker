package com.homestocker.modules.ai.habits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HabitAppliedTest {

  @Test
  void resolvesDefaultSpaceOnlyWhenWriteMatches() {
    List<FamilyHabit> stored =
        List.of(new FamilyHabit(HabitSlots.DEFAULT_SPACE, "客厅"));
    List<Map<String, Object>> applied =
        HabitApplied.resolve(
            List.of(HabitSlots.DEFAULT_SPACE),
            stored,
            List.of(Map.of("spaceName", "客厅")));
    assertEquals(1, applied.size());
    assertEquals("默认落点", applied.get(0).get("label"));
    assertTrue(HabitApplied.labelLine(applied).startsWith("根据习惯："));
  }

  @Test
  void dropsMismatchedOrUnknownSlots() {
    List<FamilyHabit> stored =
        List.of(new FamilyHabit(HabitSlots.DEFAULT_SPACE, "客厅"));
    assertTrue(
        HabitApplied.resolve(
                List.of(HabitSlots.DEFAULT_SPACE, "nope"),
                stored,
                List.of(Map.of("spaceName", "厨房")))
            .isEmpty());
  }

  @Test
  void factFallbackWhenDefaultSpaceMatchesWriteEvenIfUndeclared() {
    List<FamilyHabit> stored =
        List.of(new FamilyHabit(HabitSlots.DEFAULT_SPACE, "客厅"));
    List<Map<String, Object>> applied =
        HabitApplied.resolve(List.of(), stored, List.of(Map.of("spaceName", "客厅")));
    assertEquals(1, applied.size());
    assertEquals(HabitSlots.DEFAULT_SPACE, applied.get(0).get("slot"));
  }
}
