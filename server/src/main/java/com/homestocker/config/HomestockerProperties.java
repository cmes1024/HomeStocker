package com.homestocker.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "homestocker")
public class HomestockerProperties {

  private final Wechat wechat = new Wechat();
  private final Session session = new Session();
  private final Cors cors = new Cors();
  private final Admin admin = new Admin();
  private final ExpireNotify expireNotify = new ExpireNotify();
  private final Storage storage = new Storage();
  private final Ai ai = new Ai();

  public Wechat getWechat() {
    return wechat;
  }

  public Session getSession() {
    return session;
  }

  public Cors getCors() {
    return cors;
  }

  public Admin getAdmin() {
    return admin;
  }

  public ExpireNotify getExpireNotify() {
    return expireNotify;
  }

  public Storage getStorage() {
    return storage;
  }

  public Ai getAi() {
    return ai;
  }

  public static class Wechat {
    private String appId = "";
    private String appSecret = "";
    /** Local-only: treat login code as openid when true (never enable in production). */
    private boolean mockEnabled = false;

    public String getAppId() {
      return appId;
    }

    public void setAppId(String appId) {
      this.appId = appId;
    }

    public String getAppSecret() {
      return appSecret;
    }

    public void setAppSecret(String appSecret) {
      this.appSecret = appSecret;
    }

    public boolean isMockEnabled() {
      return mockEnabled;
    }

    public void setMockEnabled(boolean mockEnabled) {
      this.mockEnabled = mockEnabled;
    }
  }

  public static class Session {
    private String header = "X-HS-Token";
    private int ttlDays = 30;

    public String getHeader() {
      return header;
    }

    public void setHeader(String header) {
      this.header = header;
    }

    public int getTtlDays() {
      return ttlDays;
    }

    public void setTtlDays(int ttlDays) {
      this.ttlDays = ttlDays;
    }
  }

  public static class Cors {
    private List<String> allowedOriginPatterns = new ArrayList<>(List.of("*"));

    public List<String> getAllowedOriginPatterns() {
      return allowedOriginPatterns;
    }

    public void setAllowedOriginPatterns(List<String> allowedOriginPatterns) {
      this.allowedOriginPatterns = allowedOriginPatterns;
    }
  }

  /** 内测发码等运营权限（openid 白名单，来自环境变量）。 */
  public static class Admin {
    /**
     * 可发体验码的微信 openid；多个用英文逗号分隔。
     * 例：oXXXX,oYYYY
     */
    private String openids = "";

    public String getOpenids() {
      return openids;
    }

    public void setOpenids(String openids) {
      this.openids = openids == null ? "" : openids;
    }
  }

  public static class ExpireNotify {
    private String tmplId = "";
    private String cron = "0 0 8 * * *";

    public String getTmplId() {
      return tmplId;
    }

    public void setTmplId(String tmplId) {
      this.tmplId = tmplId;
    }

    public String getCron() {
      return cron;
    }

    public void setCron(String cron) {
      this.cron = cron;
    }
  }

  public static class Storage {
    private String provider = "minio";
    /** API → MinIO（Compose 内网可用 http://minio:9000）。 */
    private String endpoint = "http://localhost:9000";
    /**
     * 小程序 / 浏览器可达的基址（Compose 默认 http://127.0.0.1:9000）。
     * 空则回退 endpoint。presign URL 与 publicUrl 均改写到此主机。
     */
    private String publicEndpoint = "";
    private String accessKey = "minioadmin";
    private String secretKey = "minioadmin";
    private String bucket = "homestocker";

    public String getProvider() {
      return provider;
    }

    public void setProvider(String provider) {
      this.provider = provider;
    }

    public String getEndpoint() {
      return endpoint;
    }

    public void setEndpoint(String endpoint) {
      this.endpoint = endpoint;
    }

    public String getPublicEndpoint() {
      return publicEndpoint;
    }

    public void setPublicEndpoint(String publicEndpoint) {
      this.publicEndpoint = publicEndpoint;
    }

    /** Non-blank public endpoint, else internal endpoint. */
    public String resolvePublicEndpoint() {
      if (publicEndpoint != null && !publicEndpoint.isBlank()) {
        return publicEndpoint.trim();
      }
      return endpoint == null ? "" : endpoint.trim();
    }

    public String getAccessKey() {
      return accessKey;
    }

    public void setAccessKey(String accessKey) {
      this.accessKey = accessKey;
    }

    public String getSecretKey() {
      return secretKey;
    }

    public void setSecretKey(String secretKey) {
      this.secretKey = secretKey;
    }

    public String getBucket() {
      return bucket;
    }

    public void setBucket(String bucket) {
      this.bucket = bucket;
    }
  }

  public static class Ai {
    /** Max ai.act calls per openid per rolling minute; 0 = disabled. */
    private int actRatePerMinute = 30;

    public int getActRatePerMinute() {
      return actRatePerMinute;
    }

    public void setActRatePerMinute(int actRatePerMinute) {
      this.actRatePerMinute = actRatePerMinute;
    }
  }
}
