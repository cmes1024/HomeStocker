package com.homestocker.modules.family.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/** Mirrors cloud {@code entitlements.js} — keep limits in sync. */
public final class CapacityPlans {

  public static final String FREE_PLAN_ID = "free";
  public static final String CAPACITY_STD = "capacity_std";

  public static final Map<String, PlanLimits> PLANS =
      Map.of(
          FREE_PLAN_ID, new PlanLimits(1, 2, 50, 30),
          CAPACITY_STD, new PlanLimits(null, null, null, 200));

  public static final Map<String, ProductDef> PRODUCTS =
      Map.of(
          "capacity_90d", new ProductDef(CAPACITY_STD, 90),
          "capacity_365d", new ProductDef(CAPACITY_STD, 365));

  private CapacityPlans() {}

  public record PlanLimits(
      Integer familyLimit, Integer memberLimit, Integer itemLimit, Integer activityLimit) {}

  public record ProductDef(String planId, int days) {}

  public static String normalizeCode(String code) {
    if (code == null) {
      return "";
    }
    return code.trim().toUpperCase().replaceAll("[\\s-]+", "");
  }

  public static String hashCode(String plaintext) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] dig = md.digest(normalizeCode(plaintext).getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(dig);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  public static PlanLimits resolveLimits(String planId, Map<String, Object> override) {
    PlanLimits plan = PLANS.getOrDefault(planId, PLANS.get(FREE_PLAN_ID));
    return new PlanLimits(
        resolveOne(plan.familyLimit(), override, "familyLimit"),
        resolveOne(plan.memberLimit(), override, "memberLimit"),
        resolveOne(plan.itemLimit(), override, "itemLimit"),
        resolveOne(plan.activityLimit(), override, "activityLimit"));
  }

  private static Integer resolveOne(Integer planValue, Map<String, Object> override, String key) {
    Integer value = planValue;
    if (override != null && override.containsKey(key)) {
      Object v = override.get(key);
      if (v == null || "".equals(v)) {
        value = null;
      } else {
        try {
          value = Integer.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
          value = field(PLANS.get(FREE_PLAN_ID), key);
        }
      }
    }
    return value;
  }

  private static Integer field(PlanLimits free, String key) {
    return switch (key) {
      case "familyLimit" -> free.familyLimit();
      case "memberLimit" -> free.memberLimit();
      case "itemLimit" -> free.itemLimit();
      case "activityLimit" -> free.activityLimit();
      default -> null;
    };
  }

  public static Map<String, Object> toEntitlementMap(EffectiveEntitlement e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("planId", e.planId());
    m.put("active", e.active());
    m.put("expiresAt", e.expiresAt());
    m.put("itemLimit", e.itemLimit());
    m.put("memberLimit", e.memberLimit());
    m.put("familyLimit", e.familyLimit());
    m.put("activityLimit", e.activityLimit());
    m.put("product", e.product());
    return m;
  }

  public record EffectiveEntitlement(
      String planId,
      boolean active,
      Long expiresAt,
      String product,
      Integer familyLimit,
      Integer memberLimit,
      Integer itemLimit,
      Integer activityLimit) {

    public static EffectiveEntitlement free(Long expiresAt, String product) {
      PlanLimits lim = PLANS.get(FREE_PLAN_ID);
      return new EffectiveEntitlement(
          FREE_PLAN_ID,
          false,
          expiresAt,
          product,
          lim.familyLimit(),
          lim.memberLimit(),
          lim.itemLimit(),
          lim.activityLimit());
    }

    public static EffectiveEntitlement fromSub(
        String planId, long expiresAt, String product, Map<String, Object> override) {
      String pid = planId != null && PLANS.containsKey(planId) ? planId : CAPACITY_STD;
      PlanLimits lim = resolveLimits(pid, override);
      return new EffectiveEntitlement(
          pid,
          true,
          expiresAt,
          product,
          lim.familyLimit(),
          lim.memberLimit(),
          lim.itemLimit(),
          lim.activityLimit());
    }
  }
}
