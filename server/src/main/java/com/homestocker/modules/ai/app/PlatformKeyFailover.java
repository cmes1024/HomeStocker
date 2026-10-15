package com.homestocker.modules.ai.app;

import com.homestocker.common.ErrorCodes;
import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import java.util.ArrayList;
import java.util.List;
import java.util.function.LongSupplier;
import java.util.function.Predicate;

/** Shared platform pool: at most two tries, skip keys still in cooldown. */
public final class PlatformKeyFailover {

  public static final long COOLDOWN_MS = 60_000L;
  public static final int MAX_ATTEMPTS = 2;
  public static final int MAX_POOL = 8;
  public static final String UNAVAILABLE = "助手暂时不可用，请稍后重试";

  private PlatformKeyFailover() {}

  public static List<KeyRow> pick(List<KeyRow> enabledInOrder, Predicate<String> cooling) {
    List<KeyRow> ready = new ArrayList<>();
    for (KeyRow key : enabledInOrder) {
      if (cooling.test(key.id())) {
        continue;
      }
      ready.add(key);
      if (ready.size() == MAX_ATTEMPTS) {
        break;
      }
    }
    return ready;
  }

  /** Family quota stays on the current key. Platform quota moves to the next key. */
  public static boolean switches(String errorCode, boolean retryable, boolean hostedPool) {
    if (hostedPool && ErrorCodes.AI_QUOTA.equals(errorCode)) {
      return true;
    }
    return retryable;
  }

  public static long cooldownUntil(LongSupplier clock) {
    return clock.getAsLong() + COOLDOWN_MS;
  }
}
