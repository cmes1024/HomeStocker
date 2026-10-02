package com.homestocker.modules.ai.habits;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Validates model-declared appliedHabits against stored habits and write results. */
public final class HabitApplied {

  private HabitApplied() {}

  /**
   * Keep declared slots that exist and match write facts when applicable.
   * Also fact-fallback: if write spaceName equals stored default_space text, include that slot
   * even when the model omitted appliedHabits (machine alignment only; no NL).
   */
  public static List<Map<String, Object>> resolve(
      List<String> declared,
      List<FamilyHabit> stored,
      List<Map<String, Object>> executedWrites) {
    if (stored == null || stored.isEmpty()) {
      return List.of();
    }
    Map<String, FamilyHabit> bySlot = new LinkedHashMap<>();
    for (FamilyHabit h : stored) {
      bySlot.put(h.slot(), h);
    }
    List<String> writeSpaces = new ArrayList<>();
    if (executedWrites != null) {
      for (Map<String, Object> w : executedWrites) {
        if (w == null) {
          continue;
        }
        String space = str(w.get("spaceName"));
        if (!space.isEmpty() && !writeSpaces.contains(space)) {
          writeSpaces.add(space);
        }
      }
    }

    List<Map<String, Object>> out = new ArrayList<>();
    java.util.Set<String> seen = new java.util.LinkedHashSet<>();

    if (declared != null) {
      for (String raw : declared) {
        String slot = raw == null ? "" : raw.trim();
        FamilyHabit h = bySlot.get(slot);
        if (h == null) {
          continue;
        }
        if (HabitSlots.DEFAULT_SPACE.equals(slot) && !writeSpaces.contains(h.text())) {
          continue;
        }
        if (seen.add(slot)) {
          out.add(rowOf(h));
        }
      }
    }

    FamilyHabit defaultSpace = bySlot.get(HabitSlots.DEFAULT_SPACE);
    if (defaultSpace != null
        && !seen.contains(HabitSlots.DEFAULT_SPACE)
        && writeSpaces.contains(defaultSpace.text())) {
      out.add(rowOf(defaultSpace));
      seen.add(HabitSlots.DEFAULT_SPACE);
    }

    return out;
  }

  public static String labelLine(List<Map<String, Object>> applied) {
    if (applied == null || applied.isEmpty()) {
      return "";
    }
    List<String> labels = new ArrayList<>();
    for (Map<String, Object> row : applied) {
      String label = str(row.get("label"));
      if (!label.isEmpty() && !labels.contains(label)) {
        labels.add(label);
      }
    }
    if (labels.isEmpty()) {
      return "";
    }
    return "根据习惯：" + String.join("、", labels);
  }

  private static Map<String, Object> rowOf(FamilyHabit h) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("slot", h.slot());
    row.put("label", HabitSlots.label(h.slot()));
    row.put("text", h.text());
    return row;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }
}
