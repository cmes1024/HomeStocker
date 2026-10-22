package com.homestocker.modules.ai.agent;

import com.homestocker.modules.ai.habits.HabitSlots;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 偏好回执排版：1–3 条逐行文本，4 条以上表格。
 * 只重排 habit.list 已经返回的事实，不判断偏好含义、不猜内容。
 */
public final class HabitReply {

  /** 达到这个条数就改用表格，避免小条目弹半屏。 */
  public static final int TABLE_MIN = 4;

  private HabitReply() {}

  /** 本轮是否只有 habit.list 这一个只读调用（有写入或别的调用时不接管）。 */
  public static boolean habitOnly(Map<String, Object> report) {
    if (report == null || Boolean.TRUE.equals(report.get("wrote"))) {
      return false;
    }
    if (!(report.get("executed") instanceof List<?> rows) || rows.isEmpty()) {
      return false;
    }
    for (Object o : rows) {
      if (!(o instanceof Map<?, ?> row) || !"habit.list".equals(str(row.get("use")))) {
        return false;
      }
    }
    return true;
  }

  @SuppressWarnings("unchecked")
  public static List<Map<String, Object>> habitsOf(Map<String, Object> report) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (report == null || !(report.get("executed") instanceof List<?> rows)) {
      return out;
    }
    for (Object o : rows) {
      if (!(o instanceof Map<?, ?> row) || !"habit.list".equals(str(row.get("use")))) {
        continue;
      }
      if (row.get("habits") instanceof List<?> list) {
        for (Object h : list) {
          if (h instanceof Map<?, ?> m) {
            out.add((Map<String, Object>) m);
          }
        }
      }
    }
    return out;
  }

  /** 0–3 条用多行文本；逐行一条，不加列表符号。 */
  public static String lines(List<Map<String, Object>> habits) {
    if (habits == null || habits.isEmpty()) {
      return "这家还没记偏好，想让我记住什么直接说。";
    }
    List<String> out = new ArrayList<>();
    out.add("这家偏好（" + habits.size() + " 条）");
    for (Map<String, Object> h : habits) {
      String text = rowText(h);
      if (text.isEmpty()) {
        continue;
      }
      out.add(rowLabel(h) + "：" + text + note(h));
    }
    return out.size() > 1 ? String.join("\n", out) : out.get(0);
  }

  /** 4 条以上：三列表格。 */
  public static Map<String, Object> table(List<Map<String, Object>> habits) {
    if (habits == null || habits.size() < TABLE_MIN) {
      return null;
    }
    List<List<String>> rows = new ArrayList<>();
    for (Map<String, Object> h : habits) {
      String text = rowText(h);
      if (text.isEmpty()) {
        continue;
      }
      rows.add(List.of(rowLabel(h), text, effect(h)));
    }
    if (rows.isEmpty()) {
      return null;
    }
    List<Map<String, Object>> columns = new ArrayList<>();
    columns.add(col("偏好", 2));
    columns.add(col("内容", 3));
    columns.add(col("生效方式", 2));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("type", "table");
    out.put("title", "这家偏好");
    out.put("columns", columns);
    out.put("rows", rows);
    out.put("caption", "「只影响说话」的不改变落库与合并");
    return out;
  }

  private static Map<String, Object> col(String label, int width) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("label", label);
    m.put("width", width);
    return m;
  }

  private static String effect(Map<String, Object> habit) {
    return HabitSlots.unsupported(str(habit.get("slot"))) ? "只影响说话" : "会照做";
  }

  private static String note(Map<String, Object> habit) {
    return HabitSlots.unsupported(str(habit.get("slot"))) ? "（只影响说话方式）" : "";
  }

  private static String rowLabel(Map<String, Object> habit) {
    String label = str(habit.get("label")).trim();
    if (!label.isEmpty()) {
      return label;
    }
    String slot = str(habit.get("slot")).trim();
    return slot.isEmpty() ? "偏好" : HabitSlots.label(slot);
  }

  private static String rowText(Map<String, Object> habit) {
    return habit == null ? "" : str(habit.get("text")).trim();
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
