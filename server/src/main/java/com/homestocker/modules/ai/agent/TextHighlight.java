package com.homestocker.modules.ai.agent;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 正文分段：只给「服务端本来就知道的事实」上色（数量、近 3 天到期的日期），
 * 不扫句子猜语义、不改模型措辞。前端按 t 上样式，纯文本仍是 text 字段。
 */
public final class TextHighlight {

  /** 最多高亮多少段，超出的按普通文字输出。 */
  public static final int MAX_HIGHLIGHTS = 6;

  /** 到期日在这么多天内才标警示色。 */
  public static final int WARN_DAYS = 3;

  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

  private TextHighlight() {}

  public static List<Map<String, Object>> segments(String text, List<Map<String, Object>> rows) {
    if (text == null || text.isBlank() || rows == null || rows.isEmpty()) {
      return List.of();
    }
    List<Map<String, String>> marks = marks(rows);
    if (marks.isEmpty()) {
      return List.of();
    }
    marks.sort(Comparator.comparingInt(TextHighlight::span).reversed());
    List<Map<String, Object>> out = new ArrayList<>();
    StringBuilder plain = new StringBuilder();
    int highlights = 0;
    int i = 0;
    while (i < text.length()) {
      Map<String, String> hit = null;
      String literal = null;
      if (highlights < MAX_HIGHLIGHTS) {
        for (Map<String, String> mark : marks) {
          literal = matchAt(text, i, mark);
          if (literal != null) {
            hit = mark;
            break;
          }
        }
      }
      if (hit == null) {
        plain.append(text.charAt(i));
        i++;
        continue;
      }
      flush(out, plain);
      Map<String, Object> seg = new LinkedHashMap<>();
      seg.put("t", hit.get("t"));
      seg.put("v", literal);
      out.add(seg);
      highlights++;
      i += literal.length();
    }
    flush(out, plain);
    return out;
  }

  /** 候选长度：数量段按「数字+单位」算，日期段按字面量算。 */
  private static int span(Map<String, String> mark) {
    String qty = mark.get("qty");
    if (qty != null) {
      return qty.length() + mark.get("unit").length();
    }
    return mark.get("v").length();
  }

  /** 在 at 处匹配一个候选；数量与单位之间允许空白，命中值取原文子串。 */
  private static String matchAt(String text, int at, Map<String, String> mark) {
    String qty = mark.get("qty");
    if (qty == null) {
      String literal = mark.get("v");
      return !literal.isEmpty() && text.startsWith(literal, at) ? literal : null;
    }
    if (!text.startsWith(qty, at)) {
      return null;
    }
    String unit = mark.get("unit");
    int j = at + qty.length();
    while (j < text.length() && isSpace(text.charAt(j))) {
      j++;
    }
    if (!text.startsWith(unit, j)) {
      return null;
    }
    return text.substring(at, j + unit.length());
  }

  private static boolean isSpace(char c) {
    return c == ' ' || c == '\t' || c == '\u00A0' || c == '\u3000';
  }

  private static void flush(List<Map<String, Object>> out, StringBuilder plain) {
    if (plain.length() == 0) {
      return;
    }
    Map<String, Object> seg = new LinkedHashMap<>();
    seg.put("t", "text");
    seg.put("v", plain.toString());
    out.add(seg);
    plain.setLength(0);
  }

  /** 候选字面量：数量+单位（num，数字与单位之间允许空白）、近 3 天到期的日期（warn）。 */
  private static List<Map<String, String>> marks(List<Map<String, Object>> rows) {
    LocalDate today = LocalDate.now(ZONE);
    List<Map<String, String>> out = new ArrayList<>();
    List<String> seen = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      if (row == null) {
        continue;
      }
      String qty = plain(row.get("quantity"));
      String unit = str(row.get("unit"));
      if (!qty.isEmpty() && !unit.isEmpty()) {
        addQuantity(out, seen, qty, unit);
      }
      LocalDate expire = date(row.get("expireDate"));
      if (expire != null) {
        long days = expire.toEpochDay() - today.toEpochDay();
        if (days <= WARN_DAYS) {
          add(out, seen, "warn", expire.getMonthValue() + "月" + expire.getDayOfMonth() + "日");
          String raw = str(row.get("expireDate"));
          if (!raw.isEmpty()) {
            add(out, seen, "warn", raw);
          }
        }
      }
    }
    return out;
  }

  private static void add(
      List<Map<String, String>> out, List<String> seen, String tone, String literal) {
    if (literal == null || literal.length() < 2 || seen.contains(literal)) {
      return;
    }
    seen.add(literal);
    Map<String, String> mark = new LinkedHashMap<>();
    mark.put("t", tone);
    mark.put("v", literal);
    out.add(mark);
  }

  /** 数量与单位分开存：正文可能写成「3 瓶」，命中时取原文里的实际子串。 */
  private static void addQuantity(
      List<Map<String, String>> out, List<String> seen, String qty, String unit) {
    String key = qty + '\u0000' + unit;
    if (qty.length() + unit.length() < 2 || seen.contains(key)) {
      return;
    }
    seen.add(key);
    Map<String, String> mark = new LinkedHashMap<>();
    mark.put("t", "num");
    mark.put("qty", qty);
    mark.put("unit", unit);
    out.add(mark);
  }

  static String plain(Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof BigDecimal d) {
      BigDecimal stripped = d.stripTrailingZeros();
      return stripped.scale() <= 0
          ? stripped.toBigInteger().toString()
          : stripped.toPlainString();
    }
    return str(value);
  }

  static LocalDate date(Object value) {
    String text = str(value);
    if (text.length() < 10) {
      return null;
    }
    try {
      return LocalDate.parse(text.substring(0, 10));
    } catch (DateTimeParseException e) {
      return null;
    }
  }

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }
}
