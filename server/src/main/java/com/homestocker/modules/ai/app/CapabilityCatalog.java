package com.homestocker.modules.ai.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of miniprogram/cloudfunctions/ai/capabilities.js */
public final class CapabilityCatalog {

  public static final String CAPABILITY_ID = "assist-act-v3";
  public static final int CAPABILITY_VERSION = 43;

  private static final Map<String, Boolean> HARD_DENY = hardDenyMap();
  private static final List<Map<String, Object>> SEED_APIS = loadSeedApis();

  private CapabilityCatalog() {}

  private static Map<String, Boolean> hardDenyMap() {
    Map<String, Boolean> m = new LinkedHashMap<>();
    m.put("family.create", true);
    m.put("family.join", true);
    m.put("family.leave", true);
    m.put("family.switchFamily", true);
    m.put("family.dissolve", true);
    m.put("family.updateBackground", true);
    m.put("family.updateExpireReminder", true);
    m.put("family.recordSubscribeExpire", true);
    m.put("ai.addKey", true);
    m.put("ai.removeKey", true);
    m.put("ai.listKeys", true);
    m.put("ai.setDefaultKey", true);
    return Map.copyOf(m);
  }

  private static List<Map<String, Object>> loadSeedApis() {
    try (InputStream in =
        CapabilityCatalog.class.getResourceAsStream("/ai/capability-seed-v43.json")) {
      if (in == null) {
        return List.of();
      }
      ObjectMapper om = new ObjectMapper();
      return om.readValue(in, new TypeReference<>() {});
    } catch (Exception e) {
      return List.of();
    }
  }

  public static List<Map<String, Object>> seedApis() {
    return SEED_APIS;
  }

  public static boolean isHardDenied(String id) {
    String use = id == null ? "" : id.trim();
    if (use.isEmpty()) {
      return true;
    }
    if (Boolean.TRUE.equals(HARD_DENY.get(use))) {
      return true;
    }
    if (use.startsWith("family.")) {
      return true;
    }
    if (use.startsWith("ai.")) {
      return true;
    }
    return false;
  }

  public static List<Map<String, Object>> enabledApis(Map<String, Object> doc) {
    List<Map<String, Object>> out = new ArrayList<>();
    Object raw = doc != null ? doc.get("apis") : null;
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      if (!(o instanceof Map<?, ?> m)) {
        continue;
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> api = (Map<String, Object>) m;
      Object idObj = api.get("id");
      String apiId = idObj == null ? "" : String.valueOf(idObj).trim();
      if (apiId.isEmpty()) {
        continue;
      }
      if (!Boolean.TRUE.equals(api.get("enabled"))) {
        continue;
      }
      if (isHardDenied(apiId)) {
        continue;
      }
      out.add(api);
    }
    return out;
  }

  public static String renderCapabilities(Map<String, Object> doc) {
    StringBuilder sb = new StringBuilder();
    for (Map<String, Object> api : enabledApis(doc)) {
      if (sb.length() > 0) {
        sb.append('\n');
      }
      String confirm = Boolean.TRUE.equals(api.get("confirm")) ? "（执行前必须用户确认）" : "";
      Object args = api.get("args");
      String argsLine =
          args != null && !String.valueOf(args).isEmpty()
              ? "\n  参数：" + args
              : "";
      sb.append("- ")
          .append(api.get("id"))
          .append(confirm)
          .append("：")
          .append(api.get("hint") != null ? api.get("hint") : "")
          .append(argsLine);
    }
    return sb.length() == 0 ? "无" : sb.toString();
  }

  public static Map<String, Object> seedDocument() {
    Map<String, Object> doc = new LinkedHashMap<>();
    doc.put("version", CAPABILITY_VERSION);
    doc.put("apis", new ArrayList<>(SEED_APIS));
    return doc;
  }
}
