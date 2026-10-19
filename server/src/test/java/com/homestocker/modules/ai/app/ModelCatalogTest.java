package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.common.ApiException;
import org.junit.jupiter.api.Test;

class ModelCatalogTest {

  @Test
  void blankProviderUsesDeepseekDefault() {
    ModelCatalog.Resolved resolved = ModelCatalog.resolve("", "");
    assertEquals("deepseek", resolved.provider());
    assertEquals("deepseek-flash", resolved.model());
    assertEquals("https://api.deepseek.com/v1", resolved.baseUrl());
    assertTrue(resolved.vision());
  }

  @Test
  void deepseekOffersCurrentLineupWithLegacyKept() {
    // 官方在售 flash（可看图）/ v4-pro；旧的 deepseek-chat 保留以兼容存量密钥
    ModelCatalog.Resolved flash = ModelCatalog.resolve("deepseek", "deepseek-flash");
    assertTrue(flash.vision());
    assertTrue(flash.jsonObject());

    ModelCatalog.Resolved pro = ModelCatalog.resolve("deepseek", "deepseek-v4-pro");
    assertFalse(pro.vision());
    assertTrue(pro.jsonObject());

    ModelCatalog.Resolved legacy = ModelCatalog.resolve("deepseek", "deepseek-chat");
    assertFalse(legacy.vision());
    assertTrue(legacy.jsonObject());
  }

  @Test
  void clientBaseUrlIsNotPartOfResolve() {
    ModelCatalog.Resolved resolved = ModelCatalog.resolve("zhipu", "");
    assertEquals("https://open.bigmodel.cn/api/paas/v4", resolved.baseUrl());
    assertEquals("glm-5.3-flash", resolved.model());
  }

  @Test
  void unknownModelRejected() {
    assertThrows(ApiException.class, () -> ModelCatalog.resolve("kimi", "not-a-model"));
  }

  @Test
  void legacyDeepseekHostStillUsesV1() {
    assertEquals(
        "https://api.deepseek.com/v1/chat/completions",
        ModelCatalog.completionsUrl("https://api.deepseek.com"));
  }

  @Test
  void zhipuPathDoesNotGainExtraV1() {
    String url = ModelCatalog.completionsUrl("https://open.bigmodel.cn/api/paas/v4");
    assertEquals("https://open.bigmodel.cn/api/paas/v4/chat/completions", url);
    assertFalse(url.contains("/v4/v1"));
  }

  @Test
  void retiredKimiIdCallsTheLiveModel() {
    assertEquals("kimi-k2.6", ModelCatalog.callModel("kimi", "kimi-k2"));
  }

  @Test
  void presetsOmitBaseUrl() {
    var presets = ModelCatalog.clientPresets();
    assertEquals(7, presets.size());
    assertTrue(presets.stream().noneMatch(row -> row.containsKey("baseUrl")));
  }

  @Test
  void mimoUsesOfficialHostAndFlashModel() {
    ModelCatalog.Resolved resolved = ModelCatalog.resolve("mimo", "");
    assertEquals("mimo", resolved.provider());
    assertEquals("小米 MiMo", resolved.providerLabel());
    assertEquals("mimo-v2.6-flash", resolved.model());
    assertEquals("https://api.xiaomimimo.com/v1", resolved.baseUrl());
    assertTrue(resolved.jsonObject());
    assertEquals(
        "https://api.xiaomimimo.com/v1/chat/completions",
        ModelCatalog.completionsUrl(resolved.baseUrl()));

    ModelCatalog.Resolved pro = ModelCatalog.resolve("mimo", "mimo-v2.6-pro");
    assertEquals("mimo-v2.6-pro", pro.model());
    assertEquals(resolved.baseUrl(), pro.baseUrl());
  }
}
