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

  /** 该槽是否由服务端闸门真正执行（当前只有默认落点影响写库落点）。 */
  public static boolean serverExecuted(String slot) {
    return DEFAULT_SPACE.equals(slot == null ? "" : slot.trim());
  }

  /** 当前系统无法据此改变流程的槽：写入拒收，避免记下却永远不兑现。 */
  public static boolean unsupported(String slot) {
    return DUPLICATE_NAME.equals(slot == null ? "" : slot.trim());
  }

  /** 行内执行者说明；不得含「：」，默认落点由 PlaceGrounding 按文本解析。 */
  public static String enforceNote(String slot) {
    String s = slot == null ? "" : slot.trim();
    if (serverExecuted(s)) {
      return "服务端执行，缺落点时可补 spaceName";
    }
    if (unsupported(s)) {
      return "仅供措辞，不改变落库或合并流程";
    }
    return "仅影响措辞与缺省";
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
