package com.homestocker.modules.family.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.modules.family.domain.HostedModelRules.Decision;
import com.homestocker.modules.family.domain.HostedModelRules.Source;
import org.junit.jupiter.api.Test;

class HostedModelRulesTest {

  private static final long NOW = 1_700_000_000_000L;
  private static final int DAYS = 90;

  @Test
  void omittedFlagDoesNotGrant() {
    assertFalse(HostedModelRules.flag(null));
    assertFalse(HostedModelRules.flag(false));
    assertFalse(HostedModelRules.flag(""));
    assertFalse(HostedModelRules.flag("false"));
  }

  @Test
  void explicitFlagSnapshotsGrant() {
    assertTrue(HostedModelRules.flag(true));
    assertTrue(HostedModelRules.flag("true"));
    assertTrue(HostedModelRules.flag("1"));
  }

  @Test
  void grantExtendsStillValidHostedClock() {
    long existing = NOW + 10 * HostedModelRules.DAY_MS;
    assertEquals(existing + DAYS * HostedModelRules.DAY_MS, HostedModelRules.extendUntil(existing, NOW, DAYS));
  }

  @Test
  void pastOrMissingHostedClockStartsFromNow() {
    long expected = NOW + DAYS * HostedModelRules.DAY_MS;
    assertEquals(expected, HostedModelRules.extendUntil(null, NOW, DAYS));
    assertEquals(expected, HostedModelRules.extendUntil(NOW - HostedModelRules.DAY_MS, NOW, DAYS));
  }

  @Test
  void capacityClockIsIndependentOfHostedClock() {
    long capacity = NOW + 30 * HostedModelRules.DAY_MS;
    long hosted = HostedModelRules.extendUntil(NOW + 10 * HostedModelRules.DAY_MS, NOW, DAYS);
    assertTrue(hosted > capacity);
    assertEquals(NOW + 30 * HostedModelRules.DAY_MS, capacity);
  }

  @Test
  void activeChosenHostedStaysSelectedWhenFamilyKeysExist() {
    Decision decision =
        HostedModelRules.decide("hosted", NOW + HostedModelRules.DAY_MS, NOW, true);
    assertEquals(Source.HOSTED, decision.source());
    assertTrue(decision.visible());
    assertTrue(decision.active());
    assertTrue(decision.hostedIsDefault());
  }

  @Test
  void ownDefaultDoesNotSelectHostedPool() {
    Decision decision = HostedModelRules.decide("family", NOW + HostedModelRules.DAY_MS, NOW, true);
    assertEquals(Source.FAMILY, decision.source());
    assertTrue(decision.visible());
    assertFalse(decision.hostedIsDefault());
  }

  @Test
  void unsetSourceWithStoredKeysUsesFamily() {
    Decision decision = HostedModelRules.decide(null, NOW + HostedModelRules.DAY_MS, NOW, true);
    assertEquals(Source.FAMILY, decision.source());
  }

  @Test
  void activeHostedRunsWithoutStoredKeys() {
    Decision chosen =
        HostedModelRules.decide("family", NOW + HostedModelRules.DAY_MS, NOW, false);
    Decision unset = HostedModelRules.decide(null, NOW + HostedModelRules.DAY_MS, NOW, false);
    assertEquals(Source.HOSTED, chosen.source());
    assertEquals(Source.HOSTED, unset.source());
  }

  @Test
  void expiryReturnsDefaultToStoredKey() {
    Decision decision = HostedModelRules.decide("hosted", NOW - 1, NOW, true);
    assertEquals(Source.FAMILY, decision.source());
    assertTrue(decision.visible());
    assertFalse(decision.active());
    assertFalse(decision.hostedIsDefault());
  }

  @Test
  void expiredWithoutStoredKeysBlocks() {
    Decision decision = HostedModelRules.decide("hosted", NOW - 1, NOW, false);
    assertNull(decision.source());
    assertTrue(decision.visible());
    assertFalse(decision.active());
  }

  @Test
  void removingTheLastStoredKeyKeepsHostedAsDefault() {
    assertEquals("hosted", HostedModelRules.sourceAfterRemoval(false, true, true, "family"));
    assertNull(HostedModelRules.sourceAfterRemoval(false, false, true, "family"));
  }

  @Test
  void removingADefaultStoredKeyReturnsToTheNextFamilyKey() {
    assertEquals("family", HostedModelRules.sourceAfterRemoval(true, true, true, "family"));
    assertNull(HostedModelRules.sourceAfterRemoval(true, true, false, "family"));
    assertNull(HostedModelRules.sourceAfterRemoval(true, true, true, "hosted"));
  }

  @Test
  void familyWithoutHostedExpiryHidesTheRow() {
    Decision decision = HostedModelRules.decide(null, null, NOW, true);
    assertFalse(decision.visible());
    assertEquals(Source.FAMILY, decision.source());
  }
}
