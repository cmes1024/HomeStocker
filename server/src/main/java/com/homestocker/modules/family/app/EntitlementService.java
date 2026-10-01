package com.homestocker.modules.family.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.TimeJson;
import com.homestocker.config.HomestockerProperties;
import com.homestocker.infra.jdbc.FamilyRow;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.SubscriptionRepository;
import com.homestocker.infra.jdbc.SubscriptionRow;
import com.homestocker.modules.family.domain.CapacityPlans;
import com.homestocker.modules.family.domain.CapacityPlans.EffectiveEntitlement;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class EntitlementService {

  private final SubscriptionRepository subscriptionRepository;
  private final MembershipRepository membershipRepository;
  private final HomestockerProperties properties;
  private final ObjectMapper objectMapper;

  public EntitlementService(
      SubscriptionRepository subscriptionRepository,
      MembershipRepository membershipRepository,
      HomestockerProperties properties,
      ObjectMapper objectMapper) {
    this.subscriptionRepository = subscriptionRepository;
    this.membershipRepository = membershipRepository;
    this.properties = properties;
    this.objectMapper = objectMapper;
  }

  /** 内测发码管理员：来自环境变量 ADMIN_OPENIDS（逗号分隔）。 */
  public boolean isCapacityAdmin(String openid) {
    if (openid == null || openid.isBlank()) {
      return false;
    }
    return adminOpenids().contains(openid.trim());
  }

  private Set<String> adminOpenids() {
    String raw = properties.getAdmin().getOpenids();
    if (raw == null || raw.isBlank()) {
      return Set.of();
    }
    return Arrays.stream(raw.split("[,，\\s]+"))
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .collect(Collectors.toUnmodifiableSet());
  }

  public EffectiveEntitlement resolveForFamily(String familyId) {
    return subscriptionRepository
        .findByFamilyId(familyId)
        .map(this::fromSub)
        .orElseGet(() -> EffectiveEntitlement.free(null, null));
  }

  private EffectiveEntitlement fromSub(SubscriptionRow sub) {
    long now = System.currentTimeMillis();
    Long expiresAt = TimeJson.toEpochMs(sub.expiresAt());
    if (expiresAt == null || expiresAt <= now) {
      return EffectiveEntitlement.free(expiresAt, sub.product());
    }
    Map<String, Object> override = parseOverride(sub.limitsOverrideJson());
    return EffectiveEntitlement.fromSub(sub.planId(), expiresAt, sub.product(), override);
  }

  private Map<String, Object> parseOverride(String json) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return objectMapper.readValue(json, new TypeReference<>() {});
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * User may create/join another family only if under free.familyLimit, or already has a seat in a
   * family with unlimited familyLimit (active capacity).
   */
  public boolean userHasUnlimitedFamilySlot(String openid) {
    for (var m : membershipRepository.listByOpenid(openid)) {
      EffectiveEntitlement e = resolveForFamily(m.familyId());
      if (e.active() && e.familyLimit() == null) {
        return true;
      }
    }
    return false;
  }

  public Integer itemCountOf(FamilyRow family) {
    if (family.itemCount() == null) {
      return null;
    }
    return family.itemCount();
  }
}
