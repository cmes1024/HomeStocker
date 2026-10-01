package com.homestocker.modules.item.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.ActivityRepository;
import com.homestocker.modules.activity.app.ActivityCursorService;
import com.homestocker.modules.family.app.EntitlementService;
import com.homestocker.modules.family.domain.CapacityPlans;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Activities are best-effort: failures must not roll back item writes (caught here).
 */
@Service
public class ActivityWriteService {

  private static final Logger log = LoggerFactory.getLogger(ActivityWriteService.class);

  private final ActivityRepository activityRepository;
  private final EntitlementService entitlementService;
  private final ActivityCursorService activityCursorService;
  private final ObjectMapper objectMapper;

  public ActivityWriteService(
      ActivityRepository activityRepository,
      EntitlementService entitlementService,
      ActivityCursorService activityCursorService,
      ObjectMapper objectMapper) {
    this.activityRepository = activityRepository;
    this.entitlementService = entitlementService;
    this.activityCursorService = activityCursorService;
    this.objectMapper = objectMapper;
  }

  public void append(
      String familyId,
      String itemId,
      String action,
      String actorOpenid,
      String itemName,
      Integer batchCount,
      String spaceId,
      String spaceName,
      String locationId,
      String locationName,
      BigDecimal quantity,
      String unit,
      List<String> changedFields,
      String summary,
      String source) {
    try {
      String changedJson = null;
      if (changedFields != null) {
        changedJson = objectMapper.writeValueAsString(changedFields);
      }
      String id = UUID.randomUUID().toString();
      Timestamp now = TimeJson.nowTs();
      activityRepository.insert(
          id,
          familyId,
          itemId,
          action,
          actorOpenid,
          itemName,
          batchCount,
          spaceId,
          spaceName,
          locationId,
          locationName,
          quantity,
          unit,
          changedJson,
          summary,
          source,
          now);
      activityCursorService.put(familyId, id, now.getTime());
      trim(familyId);
    } catch (Exception e) {
      log.error("appendActivity failed familyId={} action={}", familyId, action, e);
    }
  }

  public void trim(String familyId) {
    if (familyId == null || familyId.isBlank()) {
      return;
    }
    try {
      var ent = entitlementService.resolveForFamily(familyId);
      int keepN = ent.activityLimit() == null || ent.activityLimit() <= 0
          ? CapacityPlans.PLANS.get(CapacityPlans.FREE_PLAN_ID).activityLimit()
          : ent.activityLimit();
      int total = activityRepository.countByFamily(familyId);
      int overflow = total - keepN;
      while (overflow > 0) {
        int batch = Math.min(overflow, 100);
        activityRepository.deleteOldest(familyId, batch);
        overflow -= batch;
      }
    } catch (Exception e) {
      log.error("trimActivities failed familyId={}", familyId, e);
    }
  }
}
