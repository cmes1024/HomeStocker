package com.homestocker.modules.family.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.InviteActivationRepository;
import com.homestocker.infra.jdbc.InviteActivationRepository.ActivationRow;
import com.homestocker.infra.jdbc.InviteLinkRepository;
import com.homestocker.infra.jdbc.InviteLinkRepository.LinkRow;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.SubscriptionRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.domain.CapacityPlans;
import com.homestocker.modules.family.domain.InviteRewardRules;
import com.homestocker.modules.family.domain.InviteRewardRules.Check;
import com.homestocker.modules.family.domain.InviteRewardRules.Config;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 分享奖励：链接长期有效、可被多个「从未拥有过家庭」的用户激活；奖励落在邀请者的家庭订阅上。
 *
 * <p>发奖走独立事务：被邀请者建家的事务即使已经提交，也不会因为奖励落点消失（家庭解散、外键）
 * 而回滚。幂等靠 invite_activations.invitee_openid 唯一键 + 行锁。
 */
@Service
public class InviteRewardService {

  private static final Logger log = LoggerFactory.getLogger(InviteRewardService.class);
  private static final String TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  private static final int TOKEN_LENGTH = 24;
  private static final SecureRandom RANDOM = new SecureRandom();

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final FamilyRepository familyRepository;
  private final SubscriptionRepository subscriptionRepository;
  private final InviteLinkRepository inviteLinkRepository;
  private final InviteActivationRepository inviteActivationRepository;
  private final EntitlementService entitlementService;
  private final InviteSettingsService inviteSettingsService;
  private final ObjectMapper objectMapper;
  private final int windowDays;

  public InviteRewardService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      FamilyRepository familyRepository,
      SubscriptionRepository subscriptionRepository,
      InviteLinkRepository inviteLinkRepository,
      InviteActivationRepository inviteActivationRepository,
      EntitlementService entitlementService,
      InviteSettingsService inviteSettingsService,
      ObjectMapper objectMapper,
      @Value("${homestocker.invite.window-days:30}") int windowDays) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.familyRepository = familyRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.inviteLinkRepository = inviteLinkRepository;
    this.inviteActivationRepository = inviteActivationRepository;
    this.entitlementService = entitlementService;
    this.inviteSettingsService = inviteSettingsService;
    this.objectMapper = objectMapper;
    this.windowDays = windowDays;
  }

  private Config config() {
    InviteSettingsService.Settings settings = inviteSettingsService.current();
    return new Config(settings.rewardDays(), settings.maxActivations(), windowDays);
  }

  private String openid() {
    return RequestContext.require().openid();
  }

  private static String randomToken() {
    StringBuilder sb = new StringBuilder(TOKEN_LENGTH);
    for (int i = 0; i < TOKEN_LENGTH; i++) {
      sb.append(TOKEN_ALPHABET.charAt(RANDOM.nextInt(TOKEN_ALPHABET.length())));
    }
    return sb.toString();
  }

  private boolean hasFamily(String openid, String familyId) {
    return familyId != null
        && !familyId.isBlank()
        && membershipRepository.exists(openid, familyId);
  }

  private Map<String, Object> linkView(
      String token,
      String rewardFamilyId,
      boolean needsRegenerate,
      InviteActivationRepository.Stats stats,
      InviteSettingsService.Settings settings) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("enabled", settings.enabled());
    out.put("rewardDays", settings.rewardDays());
    out.put("token", token);
    out.put("rewardFamilyId", rewardFamilyId);
    out.put("needsRegenerate", needsRegenerate);
    out.put("grantedCount", stats.count());
    out.put("grantedDays", stats.days());
    out.put("maxActivations", settings.maxActivations());
    out.put("windowDays", windowDays);
    return out;
  }

  private InviteActivationRepository.Stats statsOf(String inviterOpenid) {
    long now = System.currentTimeMillis();
    return inviteActivationRepository.grantedStats(
        inviterOpenid, new Timestamp(InviteRewardRules.windowStart(now, windowDays)));
  }

  /** 家庭页加载时取现有链接；不自动迁移、不自动新建，需用户显式「重新生成」。 */
  public Map<String, Object> getInviteLink() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    InviteSettingsService.Settings settings = inviteSettingsService.current();
    Optional<LinkRow> link = inviteLinkRepository.findActiveByInviter(openid);
    boolean needsRegenerate =
        !hasFamily(openid, familyId)
            || link.isEmpty()
            || !familyId.equals(link.get().rewardFamilyId())
            || !membershipRepository.exists(openid, link.get().rewardFamilyId());
    String token = needsRegenerate ? "" : link.get().token();
    String target = link.map(LinkRow::rewardFamilyId).orElse(familyId);
    return linkView(token, target, needsRegenerate, statsOf(openid), settings);
  }

  /** 显式重新生成：停用旧链接，冻结当时的家庭；累计次数不重置。 */
  @Transactional
  public Map<String, Object> createInviteLink() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    InviteSettingsService.Settings settings = inviteSettingsService.current();
    if (!settings.enabled()) {
      throw ApiException.badRequest("分享邀请已关闭");
    }
    if (!hasFamily(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "请先加入家庭再生成分享链接");
    }
    inviteLinkRepository.deactivateAll(openid);
    String token = randomToken();
    inviteLinkRepository.insert(token, openid, familyId);
    return linkView(token, familyId, false, statsOf(openid), settings);
  }

  /**
   * 首次建家写路径内调用：把「这个 openid 是首次拥有家庭」的结论固化成一条 pending 记录。
   * 只写无外键的表，且不抛异常，确保建家主流程不被奖励逻辑连累。
   */
  public void recordFirstFamilyPending(String inviteeOpenid, String token) {
    if (token == null || token.isBlank() || !inviteSettingsService.current().enabled()) {
      return;
    }
    try {
      Optional<LinkRow> link = inviteLinkRepository.findByToken(token.trim());
      if (link.isEmpty() || !"active".equals(link.get().status())) {
        return;
      }
      LinkRow row = link.get();
      inviteActivationRepository.insertPending(
          inviteeOpenid, row.token(), row.inviterOpenid(), row.rewardFamilyId());
    } catch (Exception e) {
      log.warn("invite pending record failed for {}: {}", inviteeOpenid, e.toString());
    }
  }

  /** 独立事务消费 pending；确定性失败记 skipped，未知异常由 Controller 兜住。 */
  @Transactional
  public Map<String, Object> claimInvite() {
    return claimFor(openid());
  }

  /**
   * 首页静默兜底：建家那次 claimInvite 若失败，pending 会残留。
   *
   * <p>被邀请者下次进首页时补发一次，无需额外定时任务；没有 pending 时只做一次主键查询。
   */
  @Transactional
  public void claimPendingIfAny() {
    String openid = openid();
    if (!inviteActivationRepository.hasPending(openid)) {
      return;
    }
    claimFor(openid);
  }

  private Map<String, Object> claimFor(String openid) {
    Optional<ActivationRow> locked = inviteActivationRepository.lockPending(openid);
    if (locked.isEmpty()) {
      return result("none", null, null);
    }
    if (!inviteSettingsService.current().enabled()) {
      inviteActivationRepository.markSkipped(openid, InviteRewardRules.Reason.DISABLED.name());
      return result("skipped", InviteRewardRules.Reason.DISABLED.name(), null);
    }
    ActivationRow row = locked.get();
    Optional<LinkRow> link = inviteLinkRepository.findByToken(row.token());
    boolean linkActive =
        link.isPresent()
            && "active".equals(link.get().status())
            && link.get().inviterOpenid().equals(row.inviterOpenid())
            && link.get().rewardFamilyId().equals(row.rewardFamilyId());
    boolean familyExists = familyRepository.findById(row.rewardFamilyId()).isPresent();
    boolean inviterStillMember =
        membershipRepository.exists(row.inviterOpenid(), row.rewardFamilyId());
    InviteActivationRepository.Stats stats = statsOf(row.inviterOpenid());
    Config config = config();
    Check check =
        InviteRewardRules.check(
            config,
            row.inviteeOpenid().equals(row.inviterOpenid()),
            linkActive,
            familyExists,
            inviterStillMember,
            stats.count());
    if (!check.grant()) {
      inviteActivationRepository.markSkipped(openid, check.reason().name());
      return result("skipped", check.reason().name(), null);
    }

    int days = InviteRewardRules.rewardDaysFor(config);
    long now = System.currentTimeMillis();
    Long existing =
        subscriptionRepository
            .findByFamilyId(row.rewardFamilyId())
            .map(s -> TimeJson.toEpochMs(s.expiresAt()))
            .orElse(null);
    long expiresAt = InviteRewardRules.extendExpiresAt(existing, now, days);
    subscriptionRepository.extendOrCreate(
        row.rewardFamilyId(),
        CapacityPlans.CAPACITY_STD,
        "invite_reward",
        "invite",
        new Timestamp(expiresAt));
    var entitlement = entitlementService.resolveForFamily(row.rewardFamilyId());
    try {
      familyRepository.updateEntitlementJson(
          row.rewardFamilyId(),
          objectMapper.writeValueAsString(CapacityPlans.toEntitlementMap(entitlement)));
    } catch (Exception e) {
      throw new IllegalStateException("entitlement snapshot failed", e);
    }
    inviteActivationRepository.markGranted(openid, days);
    log.info(
        "invite reward granted: inviter={} family={} days={} expiresAt={}",
        row.inviterOpenid(),
        row.rewardFamilyId(),
        days,
        expiresAt);
    return result("granted", null, expiresAt);
  }

  private Map<String, Object> result(String status, String reason, Long expiresAt) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", status);
    out.put("reason", reason);
    out.put("expiresAt", expiresAt);
    return out;
  }
}
