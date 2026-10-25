package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class PresentResolverExpireTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 10, 24);

  @Test
  void expiredSaysHowManyDaysAgo() {
    assertEquals("已过期 1 天", PresentResolver.expireLabel("2026-10-23", TODAY));
    assertEquals("已过期 10 天", PresentResolver.expireLabel("2026-10-14", TODAY));
  }

  @Test
  void todaySaysDueToday() {
    assertEquals("今日到期", PresentResolver.expireLabel("2026-10-24", TODAY));
  }

  @Test
  void withinThreeDaysSaysSoon() {
    assertEquals("快过期 1 天", PresentResolver.expireLabel("2026-10-25", TODAY));
    assertEquals("快过期 3 天", PresentResolver.expireLabel("2026-10-27", TODAY));
  }

  @Test
  void farOrMissingShowsNothing() {
    assertEquals("", PresentResolver.expireLabel("2026-11-30", TODAY));
    assertEquals("", PresentResolver.expireLabel("", TODAY));
    assertEquals("", PresentResolver.expireLabel("不是日期", TODAY));
  }
}
