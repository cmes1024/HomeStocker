package com.homestocker.modules.activity.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.ActivityRepository;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.app.EntitlementService;
import com.homestocker.modules.family.domain.CapacityPlans;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ActivityService {

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final ActivityRepository activityRepository;
  private final ActivityCursorService cursorService;
  private final EntitlementService entitlementService;
  private final ObjectMapper objectMapper;

  public ActivityService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      ActivityRepository activityRepository,
      ActivityCursorService cursorService,
      EntitlementService entitlementService,
      ObjectMapper objectMapper) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.activityRepository = activityRepository;
    this.cursorService = cursorService;
    this.entitlementService = entitlementService;
    this.objectMapper = objectMapper;
  }

  private record Ctx(String openid, String familyId) {}

  private Ctx requireFamily() {
    String openid = RequestContext.require().openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return new Ctx(openid, familyId);
  }

  public Map<String, Object> list(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String itemId = body.get("itemId") == null ? "" : String.valueOf(body.get("itemId")).trim();
    int skip = 0;
    if (body.get("skip") != null) {
      try {
        skip = Math.max(Integer.parseInt(String.valueOf(body.get("skip"))), 0);
      } catch (NumberFormatException ignored) {
      }
    }

    List<Map<String, Object>> list;
    if (!itemId.isEmpty()) {
      int limit = 10;
      if (body.get("limit") != null) {
        try {
          limit = Integer.parseInt(String.valueOf(body.get("limit")));
        } catch (NumberFormatException ignored) {
        }
        limit = Math.min(Math.max(limit, 1), 10);
      }
      list = activityRepository.listRecentForItem(itemId, limit);
      normalizeChangedFields(list);
      return Map.of("list", list);
    }

    var ent = entitlementService.resolveForFamily(ctx.familyId());
    int activityLimit =
        ent.activityLimit() == null || ent.activityLimit() <= 0
            ? CapacityPlans.PLANS.get(CapacityPlans.FREE_PLAN_ID).activityLimit()
            : ent.activityLimit();
    int requested = activityLimit;
    if (body.get("limit") != null) {
      try {
        requested = Integer.parseInt(String.valueOf(body.get("limit")));
      } catch (NumberFormatException ignored) {
      }
    }
    int capped = Math.min(Math.max(requested, 1), activityLimit);
    // fetch up to premium window then slice — keep simple: fetch capped directly
    list = activityRepository.listByFamily(ctx.familyId(), skip, capped);
    normalizeChangedFields(list);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("list", list);
    out.put("activityLimit", activityLimit);
    out.put(
        "premiumActivityLimit",
        CapacityPlans.PLANS.get(CapacityPlans.CAPACITY_STD).activityLimit());
    out.put("active", ent.active());
    return out;
  }

  public Map<String, Object> cursor() {
    Ctx ctx = requireFamily();
    return cursorService.getCursor(ctx.familyId());
  }

  private void normalizeChangedFields(List<Map<String, Object>> list) {
    for (Map<String, Object> op : list) {
      Object cf = op.get("changedFields");
      if (cf instanceof String s && s.startsWith("[")) {
        try {
          op.put("changedFields", objectMapper.readValue(s, List.class));
        } catch (Exception ignored) {
        }
      }
    }
  }
}
