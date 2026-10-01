package com.homestocker.infra.wechat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.config.HomestockerProperties;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * WeChat mini-program server APIs.
 *
 * <p>{@code access_token} is cached in Redis (shared across api replicas) with TTL derived from
 * WeChat {@code expires_in}, refreshed early, and invalidated on credential errors.
 */
@Component
public class WeChatClient {

  private static final Logger log = LoggerFactory.getLogger(WeChatClient.class);
  private static final String CODE2SESSION_URL =
      "https://api.weixin.qq.com/sns/jscode2session";
  private static final String TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
  private static final String SUBSCRIBE_SEND_URL =
      "https://api.weixin.qq.com/cgi-bin/message/subscribe/send";
  /** Redis key prefix; full key = prefix + appId. */
  private static final String AT_REDIS_PREFIX = "hs:wx:at:";
  /** Refresh this many seconds before WeChat expiry. */
  private static final int REFRESH_SKEW_SECONDS = 120;
  /** WeChat errcodes that mean access_token is dead — drop cache and retry once. */
  private static final Set<Integer> TOKEN_INVALID_ERRCODES = Set.of(40001, 40014, 42001);

  private final HomestockerProperties properties;
  private final RestClient restClient;
  private final ObjectMapper objectMapper;
  private final StringRedisTemplate redis;

  public WeChatClient(
      HomestockerProperties properties,
      RestClient.Builder restClientBuilder,
      ObjectMapper objectMapper,
      StringRedisTemplate redis) {
    this.properties = properties;
    this.restClient = restClientBuilder.build();
    this.objectMapper = objectMapper;
    this.redis = redis;
  }

  public Code2SessionResult code2session(String code) {
    if (code == null || code.isBlank()) {
      throw ApiException.badRequest("code 不能为空");
    }
    var wx = properties.getWechat();
    if (wx.isMockEnabled()) {
      String openid = code.startsWith("mock:") ? code.substring("mock:".length()) : code;
      if (openid.isBlank()) {
        throw ApiException.badRequest("mock code 无效");
      }
      log.warn("WeChat mock login enabled; openid={}", openid);
      return new Code2SessionResult(openid, "mock-session-key", null);
    }
    if (wx.getAppId() == null
        || wx.getAppId().isBlank()
        || wx.getAppSecret() == null
        || wx.getAppSecret().isBlank()) {
      throw ApiException.of(
          ErrorCodes.AUTH_NOT_CONFIGURED, "未配置 WECHAT_APP_ID / WECHAT_APP_SECRET");
    }

    String uri =
        UriComponentsBuilder.fromUriString(CODE2SESSION_URL)
            .queryParam("appid", wx.getAppId())
            .queryParam("secret", wx.getAppSecret())
            .queryParam("js_code", code)
            .queryParam("grant_type", "authorization_code")
            .toUriString();

    try {
      String body = restClient.get().uri(uri).retrieve().body(String.class);
      JsonNode node = objectMapper.readTree(body == null ? "{}" : body);
      int errcode = node.path("errcode").asInt(0);
      if (errcode != 0) {
        String errmsg = node.path("errmsg").asText("code2session failed");
        log.warn("code2session failed errcode={} errmsg={}", errcode, errmsg);
        throw ApiException.of(ErrorCodes.WECHAT_LOGIN_FAILED, "微信登录失败");
      }
      String openid = node.path("openid").asText("");
      if (openid.isBlank()) {
        throw ApiException.of(ErrorCodes.WECHAT_LOGIN_FAILED, "微信登录失败");
      }
      String sessionKey = node.path("session_key").asText(null);
      String unionId = node.path("unionid").asText(null);
      if (unionId != null && unionId.isBlank()) {
        unionId = null;
      }
      return new Code2SessionResult(openid, sessionKey, unionId);
    } catch (ApiException ex) {
      throw ex;
    } catch (Exception ex) {
      log.error("code2session transport error", ex);
      throw ApiException.of(ErrorCodes.WECHAT_LOGIN_FAILED, "微信登录失败");
    }
  }

  /**
   * Send subscribe message. Missing credentials → DRY_RUN (local Compose without secrets).
   */
  public SubscribeSendResult sendSubscribeMessage(
      String openid, String templateId, String page, Map<String, Object> data) {
    var wx = properties.getWechat();
    if (wx.getAppId() == null
        || wx.getAppId().isBlank()
        || wx.getAppSecret() == null
        || wx.getAppSecret().isBlank()) {
      log.info("subscribeMessage dry-run (no wechat credentials) openid={} page={}", openid, page);
      return SubscribeSendResult.dryRun();
    }
    try {
      return sendSubscribeMessageOnce(openid, templateId, page, data, true);
    } catch (Exception e) {
      log.warn("subscribeMessage transport failed openid={}", openid, e);
      return SubscribeSendResult.failed(e.getMessage());
    }
  }

  private SubscribeSendResult sendSubscribeMessageOnce(
      String openid,
      String templateId,
      String page,
      Map<String, Object> data,
      boolean allowTokenRetry)
      throws Exception {
    String token = accessToken();
    Map<String, Object> payload = new java.util.LinkedHashMap<>();
    payload.put("touser", openid);
    payload.put("template_id", templateId);
    payload.put("page", page);
    payload.put("data", data);
    payload.put("miniprogram_state", "formal");
    String body =
        restClient
            .post()
            .uri(SUBSCRIBE_SEND_URL + "?access_token=" + token)
            .body(objectMapper.writeValueAsString(payload))
            .header("Content-Type", "application/json")
            .retrieve()
            .body(String.class);
    JsonNode node = objectMapper.readTree(body == null ? "{}" : body);
    int errcode = node.path("errcode").asInt(0);
    if (errcode == 0) {
      return SubscribeSendResult.sent();
    }
    String errmsg = node.path("errmsg").asText("subscribe send failed");
    if (allowTokenRetry && TOKEN_INVALID_ERRCODES.contains(errcode)) {
      log.warn(
          "subscribeMessage token invalid errcode={} — invalidate and retry openid={}",
          errcode,
          openid);
      invalidateAccessToken();
      return sendSubscribeMessageOnce(openid, templateId, page, data, false);
    }
    log.warn("subscribeMessage failed openid={} errcode={} errmsg={}", openid, errcode, errmsg);
    return SubscribeSendResult.failed(errmsg);
  }

  /**
   * Returns a cached stable access_token. Login ({@link #code2session}) does not use this —
   * only server APIs such as subscribe message.
   */
  private String accessToken() throws Exception {
    String appId = properties.getWechat().getAppId();
    String redisKey = AT_REDIS_PREFIX + appId;
    String cached = redis.opsForValue().get(redisKey);
    if (cached != null && !cached.isBlank()) {
      return cached;
    }
    synchronized (this) {
      cached = redis.opsForValue().get(redisKey);
      if (cached != null && !cached.isBlank()) {
        return cached;
      }
      return fetchAndCacheAccessToken(redisKey);
    }
  }

  private String fetchAndCacheAccessToken(String redisKey) throws Exception {
    var wx = properties.getWechat();
    String uri =
        UriComponentsBuilder.fromUriString(TOKEN_URL)
            .queryParam("grant_type", "client_credential")
            .queryParam("appid", wx.getAppId())
            .queryParam("secret", wx.getAppSecret())
            .toUriString();
    String body = restClient.get().uri(uri).retrieve().body(String.class);
    JsonNode node = objectMapper.readTree(body == null ? "{}" : body);
    if (node.has("errcode") && node.path("errcode").asInt() != 0) {
      throw new IllegalStateException("token error: " + node.path("errmsg").asText());
    }
    String token = node.path("access_token").asText();
    if (token == null || token.isBlank()) {
      throw new IllegalStateException("token error: empty access_token");
    }
    int expiresIn = node.path("expires_in").asInt(7200);
    long ttlSeconds = Math.max(60L, expiresIn - REFRESH_SKEW_SECONDS);
    redis.opsForValue().set(redisKey, token, Duration.ofSeconds(ttlSeconds));
    log.info("WeChat access_token refreshed; redis TTL={}s (expires_in={})", ttlSeconds, expiresIn);
    return token;
  }

  private void invalidateAccessToken() {
    String appId = properties.getWechat().getAppId();
    if (appId == null || appId.isBlank()) {
      return;
    }
    redis.delete(AT_REDIS_PREFIX + appId);
  }
}
