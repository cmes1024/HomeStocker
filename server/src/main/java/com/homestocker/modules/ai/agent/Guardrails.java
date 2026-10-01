package com.homestocker.modules.ai.agent;

import com.homestocker.modules.ai.app.AssistPromptTexts;
import com.homestocker.modules.ai.app.CapabilityCatalog;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of agent/guardrails.js */
public final class Guardrails {

  private Guardrails() {}

  public static List<Map<String, Object>> needsConfirm(
      List<Map<String, Object>> calls, Map<String, Map<String, Object>> catalogMap) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (calls == null) {
      return out;
    }
    for (Map<String, Object> call : calls) {
      if (call == null) {
        continue;
      }
      Map<String, Object> api = catalogMap.get(str(call.get("use")).trim());
      if (api != null && Boolean.TRUE.equals(api.get("confirm"))) {
        out.add(call);
      }
    }
    return out;
  }

  public static boolean planNeedsUnavailableCapability(
      List<Map<String, Object>> calls, Map<String, Map<String, Object>> catalogMap) {
    if (calls == null) {
      return false;
    }
    for (Map<String, Object> call : calls) {
      if (call == null) {
        continue;
      }
      String use = str(call.get("use")).trim();
      if (use.isEmpty()) {
        return true;
      }
      if (CapabilityCatalog.isHardDenied(use)) {
        return true;
      }
      if (!catalogMap.containsKey(use)) {
        return true;
      }
    }
    return false;
  }

  public static List<Map<String, Object>> capabilityLimitAsk() {
    Map<String, Object> ask = new LinkedHashMap<>();
    ask.put("question", AssistPromptTexts.CAPABILITY_LIMIT_ASK);
    ask.put("options", List.of());
    return List.of(ask);
  }

  public static void inventoryAuthorityForReply(Map<String, Object> opts) {
    // allow model reply path; no keyword router
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
