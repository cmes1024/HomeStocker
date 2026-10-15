package com.homestocker.modules.family.domain;

import java.util.concurrent.TimeUnit;

/** Hosted-model clock and which key source a request may use. */
public final class HostedModelRules {

  public static final long DAY_MS = TimeUnit.DAYS.toMillis(1);

  private HostedModelRules() {}

  /**
   * After a stored key is removed. No keys left and the hosted model is still active keeps that
   * model as the default. Deleting the stored default does not override an explicit hosted choice.
   * Null means leave the stored source untouched.
   */
  public static String sourceAfterRemoval(
      boolean anyRemaining,
      boolean hostedActive,
      boolean removedWasDefault,
      String currentSource) {
    if (!anyRemaining) {
      return hostedActive ? "hosted" : null;
    }
    if (removedWasDefault && !"hosted".equals(currentSource)) {
      return "family";
    }
    return null;
  }

  public enum Source {
    HOSTED,
    FAMILY
  }

  public record Decision(
      Source source, boolean visible, boolean active, boolean hostedIsDefault) {}

  public static boolean flag(Object raw) {
    if (raw instanceof Boolean b) {
      return b;
    }
    if (raw == null) {
      return false;
    }
    String text = String.valueOf(raw).trim();
    return "true".equalsIgnoreCase(text) || "1".equals(text);
  }

  /** max(existing, now) + days. A null or past expiry starts from now. */
  public static long extendUntil(Long existingMs, long nowMs, int days) {
    long base = nowMs;
    if (existingMs != null && existingMs > base) {
      base = existingMs;
    }
    return base + days * DAY_MS;
  }

  /**
   * Hosted is the source only while it is active and either chosen, or there is no stored key.
   * After expiry, stored keys become the source again. No stored keys and no active grant blocks.
   */
  public static Decision decide(
      String modelSource, Long hostedUntilMs, long nowMs, boolean hasFamilyKeys) {
    boolean visible = hostedUntilMs != null;
    boolean active = hostedUntilMs != null && hostedUntilMs > nowMs;
    boolean chosen = "hosted".equals(modelSource);
    Source source = null;
    if (active && (chosen || !hasFamilyKeys)) {
      source = Source.HOSTED;
    } else if (hasFamilyKeys) {
      source = Source.FAMILY;
    }
    return new Decision(source, visible, active, source == Source.HOSTED);
  }
}
