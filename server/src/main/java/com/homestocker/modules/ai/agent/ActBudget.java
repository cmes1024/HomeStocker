package com.homestocker.modules.ai.agent;

import java.util.function.LongSupplier;

/**
 * 一次 {@code ai.act} 的共享时限。步数和换钥匙都从这里扣，避免单次读超时叠过客户端等待。
 */
public final class ActBudget {

  public static final int TOTAL_MS = 45_000;
  /** 剩下的时间不够再开一轮模型调用。 */
  public static final int MIN_CALL_MS = 1_500;

  private final long deadlineMs;
  private final LongSupplier clock;

  public ActBudget(long nowMs) {
    this(nowMs, TOTAL_MS, System::currentTimeMillis);
  }

  ActBudget(long nowMs, int totalMs, LongSupplier clock) {
    this.deadlineMs = nowMs + totalMs;
    this.clock = clock == null ? System::currentTimeMillis : clock;
  }

  public int remainingMs() {
    long left = deadlineMs - clock.getAsLong();
    if (left <= 0) {
      return 0;
    }
    return left > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) left;
  }

  /**
   * 下一轮模型 HTTP 读超时。不够再开一轮时返回 0。
   *
   * @param capMs 单次调用上限，通常是 12 秒
   */
  public int nextCallMs(int capMs) {
    int left = remainingMs();
    if (left < MIN_CALL_MS) {
      return 0;
    }
    int cap = capMs > 0 ? capMs : left;
    return Math.min(cap, left);
  }
}
