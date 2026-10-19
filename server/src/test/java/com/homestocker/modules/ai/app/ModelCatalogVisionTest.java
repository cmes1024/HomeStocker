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
    ModelCatalog.Resolved qwen = ModelCatalog.resolve("qwen", "qwen-vl-plus");
    assertEquals("qwen-vl-plus", qwen.model());
    assertTrue(qwen.vision());

    ModelCatalog.Resolved zhipu = ModelCatalog.resolve("zhipu", "glm-4v-plus");
    assertEquals("glm-4v-plus", zhipu.model());
    assertTrue(zhipu.vision());

    ModelCatalog.Resolved dsFlash = ModelCatalog.resolve("deepseek", "deepseek-flash");
    assertEquals("deepseek-flash", dsFlash.model());
    assertTrue(dsFlash.vision());

    assertTrue(ModelCatalog.resolve("mimo", "mimo-v2.6-flash").vision());

    // 官方：Kimi K3 / K2.6 均支持图片输入
    assertTrue(ModelCatalog.resolve("kimi", "kimi-k3").vision());
    assertTrue(ModelCatalog.resolve("kimi", "kimi-k2.6").vision());

    // 官方：GLM-5.3-Flash 原生多模态；qwen3.7-plus / qwen3.8-max 支持图像理解
    assertTrue(ModelCatalog.resolve("zhipu", "glm-5.3-flash").vision());
    assertTrue(ModelCatalog.resolve("qwen", "qwen3.7-plus").vision());
    assertTrue(ModelCatalog.resolve("qwen", "qwen3.8-max").vision());
  }

  @Test
  void textModelsAreNotVision() {
    assertFalse(ModelCatalog.resolve("deepseek", "deepseek-chat").vision());
    assertFalse(ModelCatalog.resolve("deepseek", "deepseek-v4-pro").vision());
    assertFalse(ModelCatalog.resolve("qwen", "qwen3.8-flash").vision());
    assertFalse(ModelCatalog.resolve("qwen", "qwen-plus").vision());
    assertFalse(ModelCatalog.resolve("mimo", "mimo-v2.6-pro").vision());
  }

  @Test
  void unknownModelStillRejected() {
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("qwen", "qwen-vl-turbo-x"));
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("qwen", "qwen-vl-plusx"));
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("not-a-platform", "qwen-vl-plus"));
  }

  @Test
  void isVisionChecksStoredPairs() {
    assertTrue(ModelCatalog.isVision("qwen", "qwen-vl-plus"));
    assertTrue(ModelCatalog.isVision("zhipu", "glm-4v-plus"));
    assertFalse(ModelCatalog.isVision("qwen", "qwen-plus"));
    assertFalse(ModelCatalog.isVision("deepseek", "deepseek-chat"));
    assertFalse(ModelCatalog.isVision("qwen", "retired-model"));
    assertFalse(ModelCatalog.isVision("unknown", "unknown"));
    assertFalse(ModelCatalog.isVision(null, null));
  }

  @Test
  void clientPresetsCarryVisionFlag() {
    List<Map<String, Object>> presets = ModelCatalog.clientPresets();
    Map<String, Object> qwen =
        presets.stream().filter(p -> "qwen".equals(p.get("id"))).findFirst().orElseThrow();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> models = (List<Map<String, Object>>) qwen.get("models");
    Map<String, Object> vl =
        models.stream().filter(m -> "qwen-vl-plus".equals(m.get("id"))).findFirst().orElseThrow();
    assertEquals(Boolean.TRUE, vl.get("vision"));
    Map<String, Object> plus =
        models.stream().filter(m -> "qwen-plus".equals(m.get("id"))).findFirst().orElseThrow();
    assertEquals(Boolean.FALSE, plus.get("vision"));
  }

  @Test
  void visionModelsOptOutOfJsonObject() {
    // capture 与 act 都不给视觉模型强制 response_format，靠 prompt 约束 + repair
    assertFalse(ModelCatalog.resolve("qwen", "qwen-vl-plus").jsonObject());
    assertFalse(ModelCatalog.resolve("zhipu", "glm-4v-plus").jsonObject());
    assertTrue(ModelCatalog.resolve("deepseek", "deepseek-chat").jsonObject());
  }
}
