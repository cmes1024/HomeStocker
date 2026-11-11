package com.homestocker.modules.family.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.InviteSettingsRepository;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 平台级分享奖励配置：admin 可改；DB 无记录时回落到 application.yml 的默认值。
 *
 * <p>enabled=false 只影响之后的激活与入口展示，已发权益不追回。
 */
@Service
public class InviteSettingsService {

  public record Settings(boolean enabled, int rewardDays, int maxActivations) {}

  private final InviteSettingsRepository repository;
  private final EntitlementService entitlementService;
  private final int defaultRewardDays;
  private final int defaultMaxActivations;
  private final int windowDays;

  public InviteSettingsService(
      InviteSettingsRepository repository,
      EntitlementService entitlementService,
      @Value("${homestocker.invite.reward-days:7}") int defaultRewardDays,
      @Value("${homestocker.invite.max-activations:5}") int defaultMaxActivations,
      @Value("${homestocker.invite.window-days:30}") int windowDays) {
    this.repository = repository;
    this.entitlementService = entitlementService;
    this.defaultRewardDays = defaultRewardDays;
    this.defaultMaxActivations = defaultMaxActivations;
    this.windowDays = windowDays;
  }

  public Settings current() {
    return repository
        .find()
        .map(row -> new Settings(row.enabled(), row.rewardDays(), row.maxActivations()))
        .orElseGet(
            () -> new Settings(true, defaultRewardDays, defaultMaxActivations));
  }

  public Map<String, Object> view() {
    Settings settings = current();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("enabled", settings.enabled());
    out.put("rewardDays", settings.rewardDays());
    out.put("maxActivations", settings.maxActivations());
    out.put("windowDays", windowDays);
    return out;
  }

  /** 仅平台管理员可改；未传的字段保持当前值。 */
  public Map<String, Object> update(Map<String, Object> body) {
    String openid = RequestContext.require().openid();
    if (!entitlementService.isCapacityAdmin(openid)) {
      throw ApiException.of(ErrorCodes.FORBIDDEN, "无权限");
    }
    Settings now = current();
    boolean enabled = bool(body.get("enabled"), now.enabled());
    int rewardDays =
        intIn(body.get("rewardDays"), now.rewardDays(), 1, 365, "每次奖励天数需在 1–365 之间");
    int maxActivations =
        intIn(
            body.get("maxActivations"),
            now.maxActivations(),
            0,
            100,
            "次数上限需在 0–100 之间（0 表示不限）");
    repository.upsert(enabled, rewardDays, maxActivations, openid);
    return view();
  }

  private static boolean bool(Object value, boolean fallback) {
    if (value instanceof Boolean b) {
      return b;
    }
    if (value instanceof String s) {
      if ("true".equalsIgnoreCase(s.trim())) {
        return true;
      }
      if ("false".equalsIgnoreCase(s.trim())) {
        return false;
      }
    }
    return fallback;
  }

  private static int intIn(Object value, int fallback, int min, int max, String message) {
    int parsed = fallback;
    if (value instanceof Number n) {
      parsed = n.intValue();
    } else if (value instanceof String s && !s.isBlank()) {
      try {
        parsed = Integer.parseInt(s.trim());
      } catch (NumberFormatException e) {
        throw ApiException.badRequest(message);
      }
    }
    if (parsed < min || parsed > max) {
      throw ApiException.badRequest(message);
    }
    return parsed;
  }
}
