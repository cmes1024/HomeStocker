package com.homestocker.common;

import java.sql.Timestamp;
import java.time.Instant;

/** API layer uses epoch millis to match cloud-function clients. */
public final class TimeJson {

  private TimeJson() {}

  public static Long toEpochMs(Timestamp ts) {
    return ts == null ? null : ts.getTime();
  }

  public static Long toEpochMs(Instant instant) {
    return instant == null ? null : instant.toEpochMilli();
  }

  public static Timestamp nowTs() {
    return Timestamp.from(Instant.now());
  }
}
