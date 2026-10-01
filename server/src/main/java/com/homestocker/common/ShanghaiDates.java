package com.homestocker.common;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public final class ShanghaiDates {

  public static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
  private static final DateTimeFormatter YMD = DateTimeFormatter.ISO_LOCAL_DATE;
  private static final DateTimeFormatter YMD_HM =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

  private ShanghaiDates() {}

  private static final String[] WEEKDAY_CN =
      new String[] {"星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"};

  public static String todayYmd() {
    return LocalDate.now(SHANGHAI).format(YMD);
  }

  public static String todayWeekdayCn() {
    int dow = LocalDate.now(SHANGHAI).getDayOfWeek().getValue() % 7;
    return WEEKDAY_CN[dow];
  }

  /** Start of Asia/Shanghai calendar day as epoch millis. */
  public static long startOfDayEpochMs(LocalDate day) {
    return day.atStartOfDay(SHANGHAI).toInstant().toEpochMilli();
  }

  public static LocalDate todayLocalDate() {
    return LocalDate.now(SHANGHAI);
  }

  /** Asia/Shanghai 的 yyyy-MM-dd HH:mm；无效 epoch 返回空串 */
  public static String formatDateTimeMs(long epochMs) {
    if (epochMs <= 0) {
      return "";
    }
    return Instant.ofEpochMilli(epochMs).atZone(SHANGHAI).format(YMD_HM);
  }

  /**
   * 给对话正文加 [yyyy-MM-dd HH:mm] 前缀（Asia/Shanghai）。at 非法则原样返回 text。
   */
  public static String stampContent(String text, String atEpochMs) {
    String body = text == null ? "" : text;
    if (atEpochMs == null || atEpochMs.isBlank()) {
      return body;
    }
    try {
      String stamped = formatDateTimeMs(Long.parseLong(atEpochMs.trim()));
      if (stamped.isEmpty()) {
        return body;
      }
      return "[" + stamped + "] " + body;
    } catch (NumberFormatException e) {
      return body;
    }
  }

  public static String addDaysYmd(String ymd, int days) {
    return LocalDate.parse(ymd, YMD).plusDays(days).format(YMD);
  }

  /**
   * @return null to clear; empty Optional semantics via sentinel — returns parsed string, or throws
   *     via sentinel: use normalizeDateInput which returns null for clear and throws ApiException
   *     for invalid — actually return: null means clear, string means set. Invalid → special.
   */
  public static String normalizeDateInput(Object value, boolean present) {
    if (!present) {
      return "__skip__";
    }
    if (value == null || "".equals(value)) {
      return null;
    }
    String s = String.valueOf(value).trim();
    if (s.length() > 10) {
      s = s.substring(0, 10);
    }
    try {
      LocalDate.parse(s, YMD);
      return s;
    } catch (DateTimeParseException e) {
      return "__invalid__";
    }
  }
}
