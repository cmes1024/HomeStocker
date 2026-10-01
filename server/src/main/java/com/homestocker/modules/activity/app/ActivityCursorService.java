package com.homestocker.modules.activity.app;

import com.homestocker.infra.jdbc.ActivityRepository;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class ActivityCursorService {

  private static final Logger log = LoggerFactory.getLogger(ActivityCursorService.class);
  private static final String KEY_PREFIX = "hs:fam:";
  private static final String KEY_SUFFIX = ":act:cursor";

  private final StringRedisTemplate redis;
  private final ActivityRepository activityRepository;

  public ActivityCursorService(
      StringRedisTemplate redis, ActivityRepository activityRepository) {
    this.redis = redis;
    this.activityRepository = activityRepository;
  }

  public Map<String, Object> getCursor(String familyId) {
    String key = KEY_PREFIX + familyId + KEY_SUFFIX;
    try {
      String id = (String) redis.opsForHash().get(key, "id");
      Object atObj = redis.opsForHash().get(key, "at");
      if (id != null && atObj != null) {
        long at = Long.parseLong(String.valueOf(atObj));
        return Map.of("_id", id, "createdAt", at);
      }
    } catch (Exception e) {
      log.debug("cursor redis miss familyId={}", familyId);
    }
    var row = activityRepository.latestCursor(familyId);
    put(familyId, row.id(), row.createdAt());
    return Map.of("_id", row.id() == null ? "" : row.id(), "createdAt", row.createdAt());
  }

  public void put(String familyId, String id, long createdAt) {
    if (familyId == null || familyId.isBlank()) {
      return;
    }
    try {
      String key = KEY_PREFIX + familyId + KEY_SUFFIX;
      redis.opsForHash().put(key, "id", id == null ? "" : id);
      redis.opsForHash().put(key, "at", String.valueOf(createdAt));
    } catch (Exception e) {
      log.warn("cursor redis put failed familyId={}", familyId, e);
    }
  }
}
