package com.homestocker.common;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public final class ShanghaiDates {

  public static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
  private static final DateTimeFormatter YMD = DateTimeFormatter.ISO_LOCAL_DATE;

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
