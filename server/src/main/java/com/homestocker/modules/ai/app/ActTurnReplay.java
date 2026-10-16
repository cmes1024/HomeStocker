package com.homestocker.modules.ai.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 同一句（含失败后的重试）只执行一次。上一句还在写或已经写完时，不再改账。
 */
@Service
public class ActTurnReplay {

  private static final Logger log = LoggerFactory.getLogger(ActTurnReplay.class);
  static final String INFLIGHT = "inflight";
  static final Duration LOCK_TTL = Duration.ofSeconds(50);
  static final Duration RESULT_TTL = Duration.ofMinutes(3);
  private static final String KEY_PREFIX = "hs:ai:turn:";

  public enum Kind {
    PROCEED,
    REPLAY,
    BUSY
  }

  public record Claim(Kind kind, Map<String, Object> payload) {
    public static Claim proceed() {
      return new Claim(Kind.PROCEED, Map.of());
    }

    public static Claim replay(Map<String, Object> payload) {
      return new Claim(Kind.REPLAY, payload);
    }

    public static Claim busy() {
      return new Claim(Kind.BUSY, Map.of());
    }
  }

  interface SlotStore {
    String get(String key);

    boolean putIfAbsent(String key, String value, Duration ttl);

    void put(String key, String value, Duration ttl);

    void deleteIf(String key, String expected);
  }

  private final SlotStore store;
  private final ObjectMapper objectMapper;
  private final long waitMs;

  @Autowired
  public ActTurnReplay(StringRedisTemplate redis, ObjectMapper objectMapper) {
    this(new RedisSlotStore(redis), objectMapper, 46_000);
  }

  ActTurnReplay(SlotStore store, ObjectMapper objectMapper, long waitMs) {
    this.store = store;
    this.objectMapper = objectMapper;
    this.waitMs = waitMs;
  }

  public Claim begin(String openid, String turnId) {
    String key = key(openid, turnId);
    if (key.isEmpty()) {
      return Claim.proceed();
    }
    Map<String, Object> existing = readPayload(store.get(key));
    if (existing != null) {
      return Claim.replay(existing);
    }
    if (!store.putIfAbsent(key, INFLIGHT, LOCK_TTL)) {
      Map<String, Object> waited = waitForPayload(key);
      return waited != null ? Claim.replay(waited) : Claim.busy();
    }
    return Claim.proceed();
  }

  public void succeed(String openid, String turnId, Map<String, Object> payload) {
    String key = key(openid, turnId);
    if (key.isEmpty() || payload == null) {
      return;
    }
    try {
      store.put(key, objectMapper.writeValueAsString(payload), RESULT_TTL);
    } catch (Exception e) {
      log.warn("act turn replay store failed: {}", e.getMessage());
    }
  }

  public void fail(String openid, String turnId) {
    String key = key(openid, turnId);
    if (!key.isEmpty()) {
      store.deleteIf(key, INFLIGHT);
    }
  }

  public static String sanitize(Object raw) {
    String text = raw == null ? "" : String.valueOf(raw).trim();
    if (text.length() < 8 || text.length() > 64 || !text.matches("[A-Za-z0-9_-]+")) {
      return "";
    }
    return text;
  }

  private Map<String, Object> waitForPayload(String key) {
    long deadline = System.currentTimeMillis() + Math.max(0, waitMs);
    while (true) {
      Map<String, Object> payload = readPayload(store.get(key));
      if (payload != null) {
        return payload;
      }
      long left = deadline - System.currentTimeMillis();
      if (left <= 0) {
        return null;
      }
      try {
        Thread.sleep(Math.min(250, left));
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        return null;
      }
    }
  }

  private Map<String, Object> readPayload(String raw) {
    if (raw == null || raw.isBlank() || INFLIGHT.equals(raw) || raw.charAt(0) != '{') {
      return null;
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<>() {});
    } catch (Exception e) {
      log.warn("act turn replay payload unreadable");
      return null;
    }
  }

  private static String key(String openid, String turnId) {
    if (openid == null || openid.isBlank() || turnId == null || turnId.isBlank()) {
      return "";
    }
    return KEY_PREFIX + openid.trim() + ":" + turnId;
  }

  private static final class RedisSlotStore implements SlotStore {
    private final StringRedisTemplate redis;

    private RedisSlotStore(StringRedisTemplate redis) {
      this.redis = redis;
    }

    @Override
    public String get(String key) {
      try {
        return redis.opsForValue().get(key);
      } catch (Exception e) {
        log.debug("act turn replay read skipped: {}", e.getMessage());
        return null;
      }
    }

    @Override
    public boolean putIfAbsent(String key, String value, Duration ttl) {
      try {
        return Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key, value, ttl));
      } catch (Exception e) {
        log.debug("act turn replay lock skipped: {}", e.getMessage());
        return true;
      }
    }

    @Override
    public void put(String key, String value, Duration ttl) {
      try {
        redis.opsForValue().set(key, value, ttl);
      } catch (Exception e) {
        log.debug("act turn replay write skipped: {}", e.getMessage());
      }
    }

    @Override
    public void deleteIf(String key, String expected) {
      try {
        String current = redis.opsForValue().get(key);
        if (expected.equals(current)) {
          redis.delete(key);
        }
      } catch (Exception e) {
        log.debug("act turn replay release skipped: {}", e.getMessage());
      }
    }
  }
}
