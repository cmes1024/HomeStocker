package com.homestocker.common;

import com.homestocker.auth.AuthPrincipal;
import com.homestocker.auth.RequestContext;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import org.springframework.stereotype.Component;

/**
 * Shared membership / current-family checks for domain modules (M2+).
 */
@Component
public class FamilyAccess {

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;

  public FamilyAccess(UserRepository userRepository, MembershipRepository membershipRepository) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
  }

  /** Current authenticated principal (must run after auth filter). */
  public AuthPrincipal principal() {
    return RequestContext.require();
  }

  /**
   * Require users.current_family_id and a matching membership row.
   * Aligns with cloud {@code NO_FAMILY} messaging.
   */
  public FamilyContext requireCurrentFamily() {
    AuthPrincipal principal = RequestContext.require();
    String familyId =
        userRepository
            .findCurrentFamilyId(principal.openid())
            .filter(id -> id != null && !id.isBlank())
            .orElse(null);
    if (familyId == null) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(principal.openid(), familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return new FamilyContext(principal.openid(), familyId);
  }

  /** Require membership of an explicit familyId (e.g. switch / join checks). */
  public void requireMember(String openid, String familyId) {
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NOT_MEMBER, "未加入该家庭");
    }
  }
}
