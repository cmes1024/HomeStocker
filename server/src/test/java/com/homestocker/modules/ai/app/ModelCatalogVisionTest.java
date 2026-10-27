package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.common.ApiException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ModelCatalogVisionTest {

  @Test
  void visionModelsResolveWithFlag() {
    ModelCatalog.Resolved dsFlash = ModelCatalog.resolve("deepseek", "deepseek-flash");
    assertEquals("deepseek-flash", dsFlash.model());
    assertTrue(dsFlash.vision());

    assertTrue(ModelCatalog.resolve("mimo", "mimo-v2.6-flash").vision());

    // 官方：Kimi K3 / K2.6 均支持图片输入
    assertTrue(ModelCatalog.resolve("kimi", "kimi-k3").vision());
    assertTrue(ModelCatalog.resolve("kimi", "kimi-k2.6").vision());
  }

  @Test
  void textModelsAreNotVision() {
    assertFalse(ModelCatalog.resolve("deepseek", "deepseek-chat").vision());
    assertFalse(ModelCatalog.resolve("deepseek", "deepseek-v4-pro").vision());
    assertFalse(ModelCatalog.resolve("mimo", "mimo-v2.6-pro").vision());
    assertFalse(ModelCatalog.resolve("stepfun", "step-3.5-flash").vision());
  }

  @Test
  void unknownModelStillRejected() {
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("kimi", "kimi-vl-turbo-x"));
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("kimi", "kimi-k3x"));
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("not-a-platform", "kimi-k3"));
  }

  @Test
  void isVisionChecksStoredPairs() {
    assertTrue(ModelCatalog.isVision("kimi", "kimi-k3"));
    assertTrue(ModelCatalog.isVision("mimo", "mimo-v2.6-flash"));
    assertFalse(ModelCatalog.isVision("deepseek", "deepseek-v4-pro"));
    assertFalse(ModelCatalog.isVision("deepseek", "deepseek-chat"));
    assertFalse(ModelCatalog.isVision("kimi", "retired-model"));
    assertFalse(ModelCatalog.isVision("unknown", "unknown"));
    assertFalse(ModelCatalog.isVision(null, null));
  }

  @Test
  void clientPresetsCarryVisionFlag() {
    List<Map<String, Object>> presets = ModelCatalog.clientPresets();
    Map<String, Object> kimi =
        presets.stream().filter(p -> "kimi".equals(p.get("id"))).findFirst().orElseThrow();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> models = (List<Map<String, Object>>) kimi.get("models");
    Map<String, Object> k3 =
        models.stream().filter(m -> "kimi-k3".equals(m.get("id"))).findFirst().orElseThrow();
    assertEquals(Boolean.TRUE, k3.get("vision"));

    Map<String, Object> deepseek =
        presets.stream().filter(p -> "deepseek".equals(p.get("id"))).findFirst().orElseThrow();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> dsModels = (List<Map<String, Object>>) deepseek.get("models");
    Map<String, Object> chat =
        dsModels.stream()
            .filter(m -> "deepseek-chat".equals(m.get("id")))
            .findFirst()
            .orElseThrow();
    assertEquals(Boolean.FALSE, chat.get("vision"));
  }

  @Test
  void jsonObjectFlagFollowsModelConfig() {
    // 智谱 / 千问下线后，在售视觉模型均允许 response_format；
    // 这里只保证非视觉模型仍带回 json_object 能力标记
    assertTrue(ModelCatalog.resolve("deepseek", "deepseek-chat").jsonObject());
    assertTrue(ModelCatalog.resolve("kimi", "kimi-k3").jsonObject());
  }
}
