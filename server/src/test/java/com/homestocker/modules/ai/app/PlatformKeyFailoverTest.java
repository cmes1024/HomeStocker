package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.common.ErrorCodes;
import com.homestocker.modules.ai.agent.ActPrompt;
import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlatformKeyFailoverTest {

  @Test
  void quotaOnFirstPlatformKeyTriesTheNextAndFamilyQuotaDoesNot() {
    assertTrue(PlatformKeyFailover.switches(ErrorCodes.AI_QUOTA, false, true));
    assertFalse(PlatformKeyFailover.switches(ErrorCodes.AI_QUOTA, false, false));
  }

  @Test
  void retryableFailureStillSwitchesStoredKeys() {
    assertTrue(PlatformKeyFailover.switches(ErrorCodes.ACT_FAILED, true, false));
    assertTrue(PlatformKeyFailover.switches(ErrorCodes.ACT_FAILED, true, true));
  }

  @Test
  void badRequestDoesNotSwitchEitherSource() {
    assertFalse(PlatformKeyFailover.switches(ErrorCodes.ACT_FAILED, false, true));
    assertFalse(PlatformKeyFailover.switches(ErrorCodes.ACT_FAILED, false, false));
  }

  @Test
  void pickSkipsCoolingKeysAndStopsAtTwo() {
    List<KeyRow> pool = List.of(key("a"), key("b"), key("c"), key("d"));
    List<KeyRow> picked = PlatformKeyFailover.pick(pool, id -> "a".equals(id) || "b".equals(id));
    assertEquals(List.of("c", "d"), picked.stream().map(KeyRow::id).toList());
  }

  @Test
  void cooldownLastsOneMinute() {
    assertEquals(60_000L, PlatformKeyFailover.COOLDOWN_MS);
    assertEquals(1_000L + 60_000L, PlatformKeyFailover.cooldownUntil(() -> 1_000L));
  }

  @Test
  void poolCapStaysAtEight() {
    assertEquals(8, PlatformKeyFailover.MAX_POOL);
  }

  @Test
  void hostedFailureNeverSendsTheMemberToKeySettings() {
    String message =
        ActPrompt.terminalFailureMessage(true, true, 401, "家庭 AI 额度可能已用完，请检查密钥余额或更换密钥");
    assertEquals(PlatformKeyFailover.UNAVAILABLE, message);
    assertFalse(message.contains("密钥"));
    assertFalse(message.contains("额度"));
  }

  @Test
  void storedKeyFailuresKeepQuotaAndInvalidKeyCopy() {
    assertEquals(
        "家庭 AI 额度可能已用完，请检查密钥余额或更换密钥",
        ActPrompt.terminalFailureMessage(false, true, 402, "其他"));
    assertEquals(
        "密钥无效，请到 AI 配置页检查",
        ActPrompt.terminalFailureMessage(false, false, 401, "其他"));
    assertEquals("助手暂时不可用，请稍后重试", ActPrompt.terminalFailureMessage(false, false, 503, "助手暂时不可用，请稍后重试"));
  }

  private static KeyRow key(String id) {
    return new KeyRow(id, "fam", "deepseek", "DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat", "sk-secret-key", false, null);
  }
}
