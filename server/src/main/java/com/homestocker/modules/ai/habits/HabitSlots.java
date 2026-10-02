package com.homestocker.modules.ai.habits;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Locked family habit slot types (at most one entry per slot; max 7). */
public final class HabitSlots {

  public static final int MAX_FAMILY_HABITS = 7;
  public static final int MAX_TEXT_LEN = 80;

  public static final String DEFAULT_SPACE = "default_space";
  public static final String NAMING = "naming";
  public static final String UNIT = "unit";
  public static final String SUMMARIZE = "summarize";
  public static final String DUPLICATE_NAME = "duplicate_name";
  public static final String TONE = "tone";
  public static final String FOCUS = "focus";

  private static final Set<String> ALL =
      new LinkedHashSet<>(
          List.of(DEFAULT_SPACE, NAMING, UNIT, SUMMARIZE, DUPLICATE_NAME, TONE, FOCUS));

  private HabitSlots() {}

  public static boolean isKnown(String slot) {
    return slot != null && ALL.contains(slot.trim());
  }

  public static Set<String> all() {
    return ALL;
  }

  public static String label(String slot) {
    return switch (slot == null ? "" : slot.trim()) {
      case DEFAULT_SPACE -> "默认落点";
      case NAMING -> "命名";
      case UNIT -> "单位";
      case SUMMARIZE -> "归纳";
      case DUPLICATE_NAME -> "同名倾向";
      case TONE -> "语气";
      case FOCUS -> "关注点";
      default -> slot == null ? "" : slot;
    };
  }
}
