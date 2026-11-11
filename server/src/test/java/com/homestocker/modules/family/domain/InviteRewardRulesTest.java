package com.homestocker.modules.family.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.modules.family.domain.InviteRewardRules.Config;
import com.homestocker.modules.family.domain.InviteRewardRules.Reason;
import org.junit.jupiter.api.Test;

class InviteRewardRulesTest {

  private static final long NOW = 1_700_000_000_000L;
  private static final Config CONFIG = new Config(7, 5, 30);

  private static InviteRewardRules.Check check(
      boolean self, boolean link, boolean family, boolean member, int count) {
    return InviteRewardRules.check(CONFIG, self, link, family, member, count);
  }

  @Test
  void normalNewUserGrants() {
    assertTrue(check(false, true, true, true, 0).grant());
    assertTrue(check(false, true, true, true, 4).grant());
  }

  @Test
  void selfInviteIsRejectedFirst() {
    assertEquals(Reason.SELF_INVITE, check(true, false, false, false, 99).reason());
  }

  @Test
  void inactiveLinkIsRejectedEvenWhenFamilyExists() {
    var c = check(false, false, true, true, 0);
    assertFalse(c.grant());
    assertEquals(Reason.LINK_INACTIVE, c.reason());
  }

  @Test
  void dissolvedFamilyAndLeftInviterAreRejected() {
    assertEquals(Reason.FAMILY_GONE, check(false, true, false, false, 0).reason());
    assertEquals(Reason.INVITER_LEFT, check(false, true, true, false, 0).reason());
  }

  @Test
  void activationCapIsEnforced() {
    assertTrue(check(false, true, true, true, 4).grant());
    assertEquals(Reason.ACTIVATION_LIMIT, check(false, true, true, true, 5).reason());
  }

  @Test
  void zeroMaxActivationsMeansUnlimited() {
    Config unlimited = new Config(7, 0, 30);
    assertTrue(InviteRewardRules.check(unlimited, false, true, true, true, 999).grant());
  }

  /** 每次有效激活固定发配置天数，累计天数不再封顶。 */
  @Test
  void eachGrantUsesConfiguredDays() {
    assertEquals(7, InviteRewardRules.rewardDaysFor(CONFIG));
    assertEquals(3, InviteRewardRules.rewardDaysFor(new Config(3, 5, 30)));
  }

  @Test
  void renewExtendsFromExistingExpiryWhenStillValid() {
    long future = NOW + 10 * InviteRewardRules.DAY_MS;
    assertEquals(
        future + 7 * InviteRewardRules.DAY_MS,
        InviteRewardRules.extendExpiresAt(future, NOW, 7));
  }

  @Test
  void expiredOrMissingSubscriptionStartsFromNow() {
    assertEquals(
        NOW + 7 * InviteRewardRules.DAY_MS,
        InviteRewardRules.extendExpiresAt(null, NOW, 7));
    assertEquals(
        NOW + 7 * InviteRewardRules.DAY_MS,
        InviteRewardRules.extendExpiresAt(NOW - InviteRewardRules.DAY_MS, NOW, 7));
  }

  @Test
  void windowStartIsThirtyDaysBack() {
    assertEquals(
        NOW - 30 * InviteRewardRules.DAY_MS,
        InviteRewardRules.windowStart(NOW, 30));
  }

  @Test
  void invalidConfigIsRejected() {
    assertThrows(IllegalArgumentException.class, () -> new Config(0, 5, 30));
    assertThrows(IllegalArgumentException.class, () -> new Config(7, -1, 30));
    assertThrows(IllegalArgumentException.class, () -> new Config(7, 5, 0));
  }
}
