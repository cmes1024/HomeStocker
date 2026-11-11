package com.homestocker.modules.family.domain;

/**
 * 分享奖励的纯规则：不依赖 Spring / DB，便于单元测试。
 *
 * <p>口径：一条链接可被多人激活；奖励落点是邀请者的家庭；计数按邀请者 openid 全局累计。
 * 累计天数不再封顶；次数上限由配置决定（0 表示不限）。
 */
public final class InviteRewardRules {

  public static final long DAY_MS = 24L * 60 * 60 * 1000;

  private InviteRewardRules() {}

  public record Config(int rewardDays, int maxActivations, int windowDays) {
    public Config {
      if (rewardDays <= 0 || maxActivations < 0 || windowDays <= 0) {
        throw new IllegalArgumentException("invite reward config must be positive");
      }
    }
  }

  public enum Reason {
    OK,
    SELF_INVITE,
    LINK_INACTIVE,
    FAMILY_GONE,
    INVITER_LEFT,
    ACTIVATION_LIMIT,
    DISABLED
  }

  public record Check(boolean grant, Reason reason) {}

  /**
   * 发奖前的全部确定性校验。任一不通过只记 skipped，不抛给被邀请者。
   *
   * @param selfInvite 邀请者与被邀请者同一 openid
   * @param linkActive 链接仍为 active 且绑定信息未被篡改
   * @param familyExists 奖励落点家庭仍存在
   * @param inviterStillMember 邀请者仍是该家庭成员
   * @param grantedCount 时间窗内已成功发放次数
   */
  public static Check check(
      Config config,
      boolean selfInvite,
      boolean linkActive,
      boolean familyExists,
      boolean inviterStillMember,
      int grantedCount) {
    if (selfInvite) return new Check(false, Reason.SELF_INVITE);
    if (!linkActive) return new Check(false, Reason.LINK_INACTIVE);
    if (!familyExists) return new Check(false, Reason.FAMILY_GONE);
    if (!inviterStillMember) return new Check(false, Reason.INVITER_LEFT);
    if (config.maxActivations() > 0 && grantedCount >= config.maxActivations()) {
      return new Check(false, Reason.ACTIVATION_LIMIT);
    }
    return new Check(true, Reason.OK);
  }

  /** 每次有效激活固定发放配置天数，不再按累计额度截断。 */
  public static int rewardDaysFor(Config config) {
    return config.rewardDays();
  }

  /** 与 family.redeem 一致的叠加续期：base = max(现有到期, now) + days。 */
  public static long extendExpiresAt(Long existingExpiresAt, long now, int days) {
    long base = (existingExpiresAt != null && existingExpiresAt > now) ? existingExpiresAt : now;
    return base + days * DAY_MS;
  }

  public static long windowStart(long now, int windowDays) {
    return now - windowDays * DAY_MS;
  }
}
