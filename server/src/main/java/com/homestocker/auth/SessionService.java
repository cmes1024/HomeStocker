package com.homestocker.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ApiException;
import com.homestocker.config.HomestockerProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class SessionService {

  private static final Logger log = LoggerFactory.getLogger(SessionService.class);
  private static final String SESS_PREFIX = "hs:sess:";
  private static final String SK_PREFIX = "hs:wx:sk:";

  private final StringRedisTemplate redis;
  private final ObjectMapper objectMapper;
  private final Duration ttl;

  public SessionService(
      StringRedisTemplate redis, ObjectMapper objectMapper, HomestockerProperties properties) {
    this.redis = redis;
    this.objectMapper = objectMapper;
    this.ttl = Duration.ofDays(Math.max(1, properties.getSession().getTtlDays()));
  }

  public String create(String openid) {
    String token = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
    SessionRecord record = new SessionRecord(openid, System.currentTimeMillis());
    try {
      redis.opsForValue().set(SESS_PREFIX + token, objectMapper.writeValueAsString(record), ttl);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("session serialize failed", e);
    }
    return token;
  }

  public Optional<SessionRecord> find(String token) {
    if (token == null || token.isBlank()) {
      return Optional.empty();
    }
    String raw = redis.opsForValue().get(SESS_PREFIX + token);
    if (raw == null || raw.isBlank()) {
      return Optional.empty();
    }
    try {
      SessionRecord record = objectMapper.readValue(raw, SessionRecord.class);
      redis.expire(SESS_PREFIX + token, ttl);
      return Optional.of(record);
    } catch (JsonProcessingException e) {
      log.warn("Invalid session payload; deleting key");
      redis.delete(SESS_PREFIX + token);
      return Optional.empty();
    }
  }

  public SessionRecord require(String token) {
    return find(token).orElseThrow(() -> ApiException.unauthorized("未登录"));
  }

  public void destroy(String token) {
    if (token == null || token.isBlank()) {
      return;
    }
    redis.delete(SESS_PREFIX + token);
  }

  /** Optional WeChat session_key cache (never returned to clients). */
  public void storeSessionKey(String openid, String sessionKey) {
    if (openid == null || openid.isBlank() || sessionKey == null || sessionKey.isBlank()) {
      return;
    }
    redis.opsForValue().set(SK_PREFIX + openid, sessionKey, ttl);
  }
}
