package com.homestocker.modules.notify.api;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ApiResponse;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.modules.notify.app.ExpireNotifyService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notify")
public class NotifyController {

  private final ExpireNotifyService expireNotifyService;
  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;

  public NotifyController(
      ExpireNotifyService expireNotifyService,
      UserRepository userRepository,
      MembershipRepository membershipRepository) {
    this.expireNotifyService = expireNotifyService;
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
  }

  /** Manual "立即检查提醒" — any logged-in family member may trigger (aligned with cloud). */
  @PostMapping("/expire/run")
  public ApiResponse<?> runExpire() {
    String openid = RequestContext.require().openid();
    var user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null
        || familyId.isBlank()
        || !membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return ApiResponse.success(expireNotifyService.run());
  }
}
