package com.homestocker.modules.ai.app;

import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Preset chat platforms. Base URLs never come from the client. */
public final class ModelCatalog {

  public record ModelChoice(
      String id, String label, boolean jsonObject, boolean isDefault, boolean vision) {}

  public record ProviderChoice(
      String id, String label, String baseUrl, String consoleUrl, List<ModelChoice> models) {}

  public record Resolved(
      String provider,
      String providerLabel,
      String baseUrl,
      String model,
      String modelLabel,
      boolean jsonObject,
      boolean vision) {}

  private static final List<ProviderChoice> PROVIDERS =
      List.of(
          provider(
              "deepseek",
              "DeepSeek",
              "https://api.deepseek.com/v1",
              "https://platform.deepseek.com/api_keys",
              // 官方定价页（api-docs.deepseek.com/quick_start/pricing）核对：
              // 在售为 deepseek-flash（V4.1-Flash-1017，支持视觉）与 deepseek-v4-pro（V4-Pro，不支持视觉）。
              // deepseek-chat 已不在官方模型表，仅保留条目以兼容存量密钥（新建不再默认）。
              model("deepseek-flash", "DeepSeek Flash（可看图）", true, true, true),
              model("deepseek-v4-pro", "DeepSeek V4 Pro", true, false),
              model("deepseek-chat", "DeepSeek Chat（旧版）", true, false)),
          provider(
              "kimi",
              "Kimi",
              "https://api.moonshot.cn/v1",
              "https://platform.moonshot.cn/console/api-keys",
              // 官方快速开始（platform.kimi.com/docs）：K3 / K2.7 Code / K2.6 均支持文本、图片与视频输入
              model("kimi-k3", "Kimi K3（可看图）", true, true, true),
              model("kimi-k2.6", "Kimi K2.6（可看图）", true, false, true)),
          provider(
              "stepfun",
              "阶跃星辰",
              "https://api.stepfun.com/v1",
              "https://platform.stepfun.com/",
              model("step-3.5-flash", "Step 3.5 Flash", true, true)),
          provider(
              "mimo",
              "小米 MiMo",
              "https://api.xiaomimimo.com/v1",
              "https://platform.xiaomimimo.com/console/api-keys",
              // 官方文档（mimo.mi.com/models/zh-CN/mimo-v2.6-flash）：输入模态 文本/图像/视频/音频
              model("mimo-v2.6-flash", "MiMo V2.6 Flash（可看图）", true, true, true),
              model("mimo-v2.6-pro", "MiMo V2.6 Pro", true, false)));

  private ModelCatalog() {}

  public static List<Map<String, Object>> clientPresets() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (ProviderChoice provider : PROVIDERS) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("id", provider.id());
      row.put("label", provider.label());
      row.put("consoleUrl", provider.consoleUrl());
      List<Map<String, Object>> models = new ArrayList<>();
      for (ModelChoice model : provider.models()) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", model.id());
        item.put("label", model.label());
        item.put("isDefault", model.isDefault());
        item.put("vision", model.vision());
        models.add(item);
      }
      row.put("models", models);
      out.add(row);
    }
    return out;
  }

  public static Resolved resolve(String providerId, String modelId) {
    String pid = providerId == null ? "" : providerId.trim();
    if (pid.isEmpty()) {
      pid = "deepseek";
    }
    ProviderChoice provider = find(pid);
    if (provider == null) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "不支持的平台");
    }
    String mid = modelId == null ? "" : modelId.trim();
    ModelChoice model = mid.isEmpty() ? defaultModel(provider) : findModel(provider, mid);
    if (model == null) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "不支持的模型");
    }
    return new Resolved(
        provider.id(),
        provider.label(),
        provider.baseUrl(),
        model.id(),
        model.label(),
        model.jsonObject(),
        model.vision());
  }

  /** Whether a stored (provider, model) pair resolves to a vision-capable preset. */
  public static boolean isVision(String providerId, String modelId) {
    ProviderChoice provider = find(providerId == null ? "" : providerId.trim());
    if (provider == null) {
      return false;
    }
    ModelChoice model = findModel(provider, modelId == null ? "" : modelId.trim());
    return model != null && model.vision();
  }

  public static String providerLabel(String providerId) {
    ProviderChoice provider = find(providerId == null ? "" : providerId.trim());
    if (provider == null) {
      return providerId == null || providerId.isBlank() ? "DeepSeek" : providerId.trim();
    }
    return provider.label();
  }

  /** Retired ids already stored on a key still call a live model. */
  public static String callModel(String providerId, String modelId) {
    String provider = providerId == null ? "" : providerId.trim();
    String model = modelId == null ? "" : modelId.trim();
    if ("kimi".equals(provider)
        && (model.isEmpty() || "kimi-k2".equals(model) || model.startsWith("kimi-k2-"))) {
      return "kimi-k2.6";
    }
    return model;
  }

  public static boolean jsonObjectFor(String providerId, String modelId) {
    ProviderChoice provider = find(providerId == null ? "" : providerId.trim());
    if (provider == null) {
      return true;
    }
    ModelChoice model = findModel(provider, modelId == null ? "" : modelId.trim());
    if (model == null) {
      return true;
    }
    return model.jsonObject();
  }

  /** Full chat-completions URL. Legacy DeepSeek host without a version path still uses /v1. */
  public static String completionsUrl(String storedBaseUrl) {
    String b = storedBaseUrl == null ? "" : storedBaseUrl.trim();
    while (b.endsWith("/")) {
      b = b.substring(0, b.length() - 1);
    }
    if (b.isEmpty()) {
      b = "https://api.deepseek.com/v1";
    } else if ("https://api.deepseek.com".equals(b) || "http://api.deepseek.com".equals(b)) {
      b = b + "/v1";
    }
    if (b.endsWith("/chat/completions")) {
      return b;
    }
    return b + "/chat/completions";
  }

  private static ProviderChoice find(String id) {
    for (ProviderChoice provider : PROVIDERS) {
      if (provider.id().equals(id)) {
        return provider;
      }
    }
    return null;
  }

  private static ModelChoice findModel(ProviderChoice provider, String modelId) {
    for (ModelChoice model : provider.models()) {
      if (model.id().equals(modelId)) {
        return model;
      }
    }
    return null;
  }

  private static ModelChoice defaultModel(ProviderChoice provider) {
    for (ModelChoice model : provider.models()) {
      if (model.isDefault()) {
        return model;
      }
    }
    return provider.models().get(0);
  }

  private static ProviderChoice provider(
      String id, String label, String baseUrl, String consoleUrl, ModelChoice... models) {
    return new ProviderChoice(id, label, baseUrl, consoleUrl, List.of(models));
  }

  private static ModelChoice model(String id, String label, boolean jsonObject, boolean isDefault) {
    return new ModelChoice(id, label, jsonObject, isDefault, false);
  }

  private static ModelChoice model(
      String id, String label, boolean jsonObject, boolean isDefault, boolean vision) {
    return new ModelChoice(id, label, jsonObject, isDefault, vision);
  }
}
