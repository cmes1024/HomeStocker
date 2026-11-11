package com.homestocker.modules.family.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.family.app.InviteRewardService;
import com.homestocker.modules.family.app.InviteSettingsService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 分享奖励 action，路径仍是 /api/family/{action}，与既有门面一致。 */
@RestController
@RequestMapping("/api/family")
public class InviteController {

  private static final Logger log = LoggerFactory.getLogger(InviteController.class);

  private final InviteRewardService inviteRewardService;
  private final InviteSettingsService inviteSettingsService;

  public InviteController(
      InviteRewardService inviteRewardService, InviteSettingsService inviteSettingsService) {
    this.inviteRewardService = inviteRewardService;
    this.inviteSettingsService = inviteSettingsService;
  }

  /** 平台级分享奖励配置当前生效值（enabled / rewardDays / maxActivations）。 */
  @PostMapping("/getInviteSettings")
  public ApiResponse<?> getInviteSettings() {
    return ApiResponse.success(inviteSettingsService.view());
  }

  /** 仅平台管理员可改；未传字段保持当前值，权限与取值校验在 service 内。 */
  @PostMapping("/updateInviteSettings")
  public ApiResponse<?> updateInviteSettings(
      @RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(inviteSettingsService.update(body == null ? Map.of() : body));
  }

  @PostMapping("/getInviteLink")
  public ApiResponse<?> getInviteLink() {
    return ApiResponse.success(inviteRewardService.getInviteLink());
  }

  @PostMapping("/createInviteLink")
  public ApiResponse<?> createInviteLink() {
    return ApiResponse.success(inviteRewardService.createInviteLink());
  }

  /**
   * 发奖失败绝不影响被邀请者：事务回滚后此处吞掉异常，只留日志与 pending 记录供重试。
   */
  @PostMapping("/claimInvite")
  public ApiResponse<?> claimInvite() {
    try {
      return ApiResponse.success(inviteRewardService.claimInvite());
    } catch (Exception e) {
      log.warn("invite claim failed, family creation untouched: {}", e.toString());
      return ApiResponse.success(Map.of("status", "skipped", "reason", "ERROR"));
    }
  }
}
