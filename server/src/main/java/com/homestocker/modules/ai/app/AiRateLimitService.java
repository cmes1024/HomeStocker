package com.homestocker.modules.ai.app;

import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.config.HomestockerProperties;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/** Soft rate limit for ai.act (per openid, rolling minute). */
@Service
public class AiRateLimitService {

  private static final Logger log = LoggerFactory.getLogger(AiRateLimitService.class);
  private static final String KEY_PREFIX = "hs:ai:rl:";

  private final StringRedisTemplate redis;
  private final HomestockerProperties properties;

  public AiRateLimitService(StringRedisTemplate redis, HomestockerProperties properties) {
    this.redis = redis;
    this.properties = properties;
  }

  public void checkAct(String openid) {
    int limit = properties.getAi().getActRatePerMinute();
    if (limit <= 0 || openid == null || openid.isBlank()) {
      return;
    }
    String key = KEY_PREFIX + openid.trim();
    try {
      Long n = redis.opsForValue().increment(key);
      if (n != null && n == 1L) {
        redis.expire(key, Duration.ofMinutes(1));
      }
      if (n != null && n > limit) {
        throw ApiException.of(ErrorCodes.RATE_LIMITED, "助手请求太频繁，请稍后再试");
      }
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      log.debug("ai rate limit skipped: {}", e.getMessage());
    }
  }
}
