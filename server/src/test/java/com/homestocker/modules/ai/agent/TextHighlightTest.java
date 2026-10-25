package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TextHighlightTest {

  @Test
  void quantityAndUnitBecomeOneSegment() {
    List<Map<String, Object>> rows =
        List.of(Map.of("name", "牛奶", "quantity", new BigDecimal("2"), "unit", "盒"));
    List<Map<String, Object>> segs = TextHighlight.segments("冰箱里牛奶 2盒，先喝这个。", rows);
    assertEquals(3, segs.size());
    assertEquals("text", segs.get(0).get("t"));
    assertEquals("num", segs.get(1).get("t"));
    assertEquals("2盒", segs.get(1).get("v"));
    assertEquals("，先喝这个。", segs.get(2).get("v"));
    assertEquals("冰箱里牛奶 2盒，先喝这个。", join(segs));
  }

  @Test
  void nearbyExpiryDateIsWarned() {
    LocalDate soon = LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).plusDays(1);
    List<Map<String, Object>> rows =
        List.of(
            Map.of(
                "name", "酸奶",
                "quantity", new BigDecimal("1"),
                "unit", "盒",
                "expireDate", soon.toString()));
    String text = "酸奶 " + soon.getMonthValue() + "月" + soon.getDayOfMonth() + "日到期，1盒。";
    List<Map<String, Object>> segs = TextHighlight.segments(text, rows);
    assertTrue(hasTone(segs, "warn"));
    assertTrue(hasTone(segs, "num"));
    assertEquals(text, join(segs));
  }

  @Test
  void farExpiryDateIsNotHighlighted() {
    String far = LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).plusDays(90).toString();
    List<Map<String, Object>> rows = List.of(Map.of("quantity", new BigDecimal("1"), "unit", "瓶", "expireDate", far));
    List<Map<String, Object>> segs = TextHighlight.segments("酱油 1瓶。", rows);
    assertEquals(3, segs.size());
    assertTrue(!hasTone(segs, "warn"));
  }

  @Test
  void blankTextOrRowsReturnNoSegments() {
    assertTrue(TextHighlight.segments("", List.of(Map.of("quantity", 1, "unit", "盒"))).isEmpty());
    assertTrue(TextHighlight.segments("2盒", List.of()).isEmpty());
  }

  @Test
  void longNumbersDoNotEatTheWholeSentence() {
    List<Map<String, Object>> rows = List.of(Map.of("quantity", new BigDecimal("0.5"), "unit", "瓶"));
    List<Map<String, Object>> segs = TextHighlight.segments("还剩 0.5瓶。", rows);
    assertEquals("num", segs.get(1).get("t"));
    assertEquals("0.5瓶", segs.get(1).get("v"));
  }

  @Test
  void quantityWithSpaceBeforeUnitStillMatches() {
    List<Map<String, Object>> rows = List.of(Map.of("quantity", new BigDecimal("3"), "unit", "瓶"));
    String text = "酱油加好了，现在 3 瓶，在厨房橱柜。";
    List<Map<String, Object>> segs = TextHighlight.segments(text, rows);
    assertEquals(3, segs.size());
    assertEquals("num", segs.get(1).get("t"));
    assertEquals("3 瓶", segs.get(1).get("v"));
    assertEquals(text, join(segs));
  }

  private static boolean hasTone(List<Map<String, Object>> segs, String tone) {
    return segs.stream().anyMatch(s -> tone.equals(s.get("t")));
  }

  private static String join(List<Map<String, Object>> segs) {
    StringBuilder sb = new StringBuilder();
    for (Map<String, Object> seg : segs) {
      sb.append(seg.get("v"));
    }
    return sb.toString();
  }
}
