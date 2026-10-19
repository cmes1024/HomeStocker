package com.homestocker.modules.ai.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 确认闸门的服务端凭据：把「这一轮给用户看过的那批 calls」暂存起来，
 * 确认时和客户端回传的 calls 比对，防止把 itemId / quantity 换掉后重放确认。
 *
 * <p>turnId 只负责「同一句不执行两次」，管不了「执行的是不是当初展示的那批」；
 * 两者互补，都不能省。
 */
@Service
public class ActPendingPlan {

  private static final Logger log = LoggerFactory.getLogger(ActPendingPlan.class);
  static final Duration TTL = Duration.ofMinutes(30);
  private static final String KEY_PREFIX = "hs:ai:plan:";
  private static final TypeReference<List<Map<String, Object>>> CALLS = new TypeReference<>() {};

  interface Store {
    String get(String key);

    void put(String key, String value, Duration ttl);

    void delete(String key);
  }

  private final Store store;
  private final ObjectMapper objectMapper;

  @Autowired
  public ActPendingPlan(StringRedisTemplate redis, ObjectMapper objectMapper) {
    this(new RedisStore(redis), objectMapper);
  }

  ActPendingPlan(Store store, ObjectMapper objectMapper) {
    this.store = store;
    this.objectMapper = objectMapper;
  }

  /**
   * 暂存一份确认计划，返回给客户端的 planId。
   * Redis 不可用时返回空串，调用方按「无凭据」降级（不阻断主流程）。
   */
  public String save(String openid, List<Map<String, Object>> calls) {
    if (openid == null || openid.isBlank() || calls == null || calls.isEmpty()) {
      return "";
    }
    String planId = UUID.randomUUID().toString().replace("-", "");
    try {
      store.put(key(openid, planId), objectMapper.writeValueAsString(calls), TTL);
      return planId;
    } catch (Exception e) {
      log.warn("act pending plan store failed: {}", e.getMessage());
      return "";
    }
  }

  /** 读出计划但不删除：执行失败还能用同一份重试。 */
  public List<Map<String, Object>> peek(String openid, String planId) {
    String k = key(openid, planId);
    if (k.isEmpty()) {
      return null;
    }
    try {
      String raw = store.get(k);
      if (raw == null || raw.isBlank()) {
        return null;
      }
      return objectMapper.readValue(raw, CALLS);
    } catch (Exception e) {
      log.warn("act pending plan unreadable");
      return null;
    }
  }

  public void clear(String openid, String planId) {
    String k = key(openid, planId);
    if (!k.isEmpty()) {
      store.delete(k);
    }
  }

  public static String sanitize(Object raw) {
    String text = raw == null ? "" : String.valueOf(raw).trim();
    if (text.length() < 8 || text.length() > 64 || !text.matches("[A-Za-z0-9_-]+")) {
      return "";
    }
    return text;
  }

  private static String key(String openid, String planId) {
    if (openid == null || openid.isBlank() || planId == null || planId.isBlank()) {
      return "";
    }
    return KEY_PREFIX + openid.trim() + ":" + planId;
  }

  private static final class RedisStore implements Store {
    private final StringRedisTemplate redis;

    private RedisStore(StringRedisTemplate redis) {
      this.redis = redis;
    }

    @Override
    public String get(String key) {
      try {
        return redis.opsForValue().get(key);
      } catch (Exception e) {
        log.debug("act pending plan read skipped: {}", e.getMessage());
        return null;
      }
    }

    @Override
    public void put(String key, String value, Duration ttl) {
      redis.opsForValue().set(key, value, ttl);
    }

    @Override
    public void delete(String key) {
      try {
        redis.delete(key);
      } catch (Exception e) {
        log.debug("act pending plan delete skipped: {}", e.getMessage());
      }
    }
  }
}
