package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HabitReplyTest {

  @Test
  void smallListRendersOneLinePerHabit() {
    List<Map<String, Object>> habits =
        List.of(
            habit("default_space", "默认落点", "没写放哪就记到客厅"),
            habit("duplicate_name", "同名倾向", "撞名先落库再问"));

    String text = HabitReply.lines(habits);

    String[] lines = text.split("\n");
    assertEquals(3, lines.length);
    assertEquals("这家偏好（2 条）", lines[0]);
    assertEquals("默认落点：没写放哪就记到客厅", lines[1]);
    assertTrue(lines[2].contains("只影响说话方式"));
  }

  @Test
  void emptyListExplainsNoPreference() {
    assertTrue(HabitReply.lines(List.of()).contains("还没记偏好"));
  }

  @Test
  void tableOnlyWhenAtLeastFourHabits() {
    assertNull(HabitReply.table(threeHabits()));

    Map<String, Object> table = HabitReply.table(fourHabits());
    assertEquals("table", table.get("type"));
    assertEquals("这家偏好", table.get("title"));
    assertEquals(4, ((List<?>) table.get("rows")).size());
    assertEquals(3, ((List<?>) table.get("columns")).size());
    assertEquals(List.of(2, 3, 2), table.get("widths"));
  }

  @Test
  void onlyHabitListReportIsTakenOver() {
    Map<String, Object> habitOnly = new LinkedHashMap<>();
    habitOnly.put("wrote", false);
    habitOnly.put("executed", List.of(Map.of("use", "habit.list")));
    assertTrue(HabitReply.habitOnly(habitOnly));

    Map<String, Object> mixed = new LinkedHashMap<>();
    mixed.put("wrote", false);
    mixed.put("executed", List.of(Map.of("use", "habit.list"), Map.of("use", "item.search")));
    assertFalse(HabitReply.habitOnly(mixed));

    Map<String, Object> wrote = new LinkedHashMap<>();
    wrote.put("wrote", true);
    wrote.put("executed", List.of(Map.of("use", "habit.list")));
    assertFalse(HabitReply.habitOnly(wrote));
  }

  private static List<Map<String, Object>> threeHabits() {
    List<Map<String, Object>> rows = new ArrayList<>(fourHabits());
    rows.remove(3);
    return rows;
  }

  private static List<Map<String, Object>> fourHabits() {
    return List.of(
        habit("default_space", "默认落点", "没写放哪就记到客厅"),
        habit("naming", "命名", "写商品名不写广告词"),
        habit("unit", "单位", "牛奶用箱"),
        habit("duplicate_name", "同名倾向", "撞名先落库再问"));
  }

  private static Map<String, Object> habit(String slot, String label, String text) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("slot", slot);
    m.put("label", label);
    m.put("text", text);
    return m;
  }
}
