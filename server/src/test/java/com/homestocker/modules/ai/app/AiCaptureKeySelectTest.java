package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import java.sql.Timestamp;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiCaptureKeySelectTest {

  private static KeyRow familyVision() {
    return key("k1", "fam-1", "kimi", "kimi-k3");
  }

  private static KeyRow familyText() {
    return key("k2", "fam-1", "deepseek", "deepseek-chat");
  }

  private static KeyRow hostedVision() {
    return key("k3", "", "mimo", "mimo-v2.6-flash");
  }

  private static KeyRow hostedText() {
    return key("k4", "", "deepseek", "deepseek-chat");
  }

  private static KeyRow key(String id, String familyId, String provider, String model) {
    return new KeyRow(
        id,
        familyId,
        provider,
        "label",
        "https://example.com/v1",
        model,
        "secret",
        false,
        new Timestamp(0L));
  }

  @Test
  void familyVisionKeyIsKeptFirst() {
    List<KeyRow> keys =
        AiCaptureService.visionKeys(
            new ActKeyResolver.Selection(
                List.of(familyText(), familyVision(), hostedVision()), false, false));
    assertEquals(List.of(familyVision()), keys);
  }

  @Test
  void hostedVisionFallbackWhenFamilyTextOnly() {
    List<KeyRow> keys =
        AiCaptureService.visionKeys(
            new ActKeyResolver.Selection(
                List.of(familyText(), hostedVision(), hostedText()), true, false));
    assertEquals(List.of(hostedVision()), keys);
  }

  @Test
  void noVisionAnywhereMeansEmpty() {
    List<KeyRow> keys =
        AiCaptureService.visionKeys(
            new ActKeyResolver.Selection(List.of(familyText(), hostedText()), false, true));
    assertTrue(keys.isEmpty());
    assertTrue(AiCaptureService.visionKeys(null).isEmpty());
    assertTrue(
        AiCaptureService.visionKeys(new ActKeyResolver.Selection(null, false, false)).isEmpty());
  }

  @Test
  void atMostTwoKeysTried() {
    List<KeyRow> keys =
        AiCaptureService.visionKeys(
            new ActKeyResolver.Selection(
                List.of(
                    familyVision(), hostedVision(), key("k9", "fam-1", "kimi", "kimi-k2.6")),
                false,
                false));
    // 家庭视觉密钥排他优先：两把家庭视觉 key 后不再混入 hosted
    assertEquals(2, keys.size());
    assertEquals("k1", keys.get(0).id());
    assertEquals("k9", keys.get(1).id());
  }
}
