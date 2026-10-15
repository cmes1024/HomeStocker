package com.homestocker.modules.family.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.FamilyRow;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.MembershipRow;
import com.homestocker.infra.jdbc.RedeemCodeRepository;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.jdbc.SubscriptionRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.domain.HostedModelRules;
import com.homestocker.modules.family.domain.CapacityPlans;
import com.homestocker.modules.family.domain.CapacityPlans.EffectiveEntitlement;
import com.homestocker.modules.family.domain.CapacityPlans.ProductDef;
import com.homestocker.modules.family.domain.ThemeIds;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FamilyService {

  private static final String INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  private static final SecureRandom RANDOM = new SecureRandom();

  private final UserRepository userRepository;
  private final FamilyRepository familyRepository;
  private final MembershipRepository membershipRepository;
  private final SubscriptionRepository subscriptionRepository;
  private final RedeemCodeRepository redeemCodeRepository;
  private final StructureRepository structureRepository;
  private final FamilySeedService familySeedService;
  private final EntitlementService entitlementService;
  private final ObjectMapper objectMapper;

  public FamilyService(
      UserRepository userRepository,
      FamilyRepository familyRepository,
      MembershipRepository membershipRepository,
      SubscriptionRepository subscriptionRepository,
      RedeemCodeRepository redeemCodeRepository,
      StructureRepository structureRepository,
      FamilySeedService familySeedService,
      EntitlementService entitlementService,
      ObjectMapper objectMapper) {
    this.userRepository = userRepository;
    this.familyRepository = familyRepository;
    this.membershipRepository = membershipRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.redeemCodeRepository = redeemCodeRepository;
    this.structureRepository = structureRepository;
    this.familySeedService = familySeedService;
    this.entitlementService = entitlementService;
    this.objectMapper = objectMapper;
  }

  private String openid() {
    return RequestContext.require().openid();
  }

  private Map<String, Object> profileOf(UserRow user) {
    Map<String, Object> p = new LinkedHashMap<>();
    p.put("nickname", user.nickname() == null ? "" : user.nickname());
    p.put("avatarUrl", user.avatarUrl() == null ? "" : user.avatarUrl());
    return p;
  }

  private Map<String, Object> parseJsonMap(String json) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> m = objectMapper.readValue(json, Map.class);
      return m;
    } catch (Exception e) {
      return null;
    }
  }

  private String toJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private Map<String, Object> familySummary(FamilyRow family, String openid) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", family.id());
    m.put("name", family.name());
    m.put("inviteCode", family.inviteCode());
    m.put("ownerOpenid", family.ownerOpenid());
    m.put("memberCount", family.memberCount());
    m.put("createdAt", TimeJson.toEpochMs(family.createdAt()));
    m.put("background", ThemeIds.normalizeBackground(parseJsonMap(family.backgroundJson())));
    m.put("expireReminderEnabled", family.expireReminderEnabled());
    m.put("isOwner", family.ownerOpenid().equals(openid));
    m.put("isAdmin", entitlementService.isCapacityAdmin(openid));
    m.put(
        "itemCount",
        family.itemCount() == null ? null : family.itemCount());
    return m;
  }

  private Map<String, Object> withCapacity(FamilyRow family, String openid) {
    Map<String, Object> base = familySummary(family, openid);
    EffectiveEntitlement e = entitlementService.resolveForFamily(family.id());
    base.put("entitlement", CapacityPlans.toEntitlementMap(e));
    return base;
  }

  private void assertUserFamilyCapacity(String openid) {
    int count = membershipRepository.countByOpenid(openid);
    Integer freeLimit = CapacityPlans.PLANS.get(CapacityPlans.FREE_PLAN_ID).familyLimit();
    if (freeLimit != null && count >= freeLimit && !entitlementService.userHasUnlimitedFamilySlot(openid)) {
      throw ApiException.of(ErrorCodes.FAMILY_LIMIT_REACHED, "已达家庭数量上限，请先兑换加强版或离开现有家庭");
    }
  }

  private void assertMemberCapacity(String familyId, FamilyRow family) {
    EffectiveEntitlement e = entitlementService.resolveForFamily(familyId);
    Integer limit = e.memberLimit();
    if (limit != null && family.memberCount() + 1 > limit) {
      throw ApiException.of(ErrorCodes.MEMBER_LIMIT_REACHED, "该家庭人数已满");
    }
  }

  private String randomInviteCode() {
    StringBuilder sb = new StringBuilder(6);
    for (int i = 0; i < 6; i++) {
      sb.append(INVITE_ALPHABET.charAt(RANDOM.nextInt(INVITE_ALPHABET.length())));
    }
    return sb.toString();
  }

  private String createUniqueInviteCode() {
    for (int i = 0; i < 8; i++) {
      String code = randomInviteCode();
      if (!familyRepository.inviteCodeExists(code)) {
        return code;
      }
    }
    throw ApiException.of(ErrorCodes.INVITE_CODE_EXHAUSTED, "邀请码生成失败，请重试");
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    String openid = openid();
    userRepository.ensureUser(openid);
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入家庭名称");
    }
    assertUserFamilyCapacity(openid);

    Map<String, Object> background = ThemeIds.DEFAULT_BACKGROUND;
    if (body.get("background") != null) {
      background = ThemeIds.normalizeBackground(body.get("background"));
    }

    String familyId = UUID.randomUUID().toString();
    String invite = createUniqueInviteCode();
    Timestamp now = TimeJson.nowTs();
    familyRepository.insert(familyId, name, invite, openid, toJson(background), now);
    membershipRepository.insert(openid, familyId, now);
    userRepository.setCurrentFamily(openid, familyId);
    familySeedService.seedStructureTree(familyId);

    FamilyRow family = familyRepository.findById(familyId).orElseThrow();
    return withCapacity(family, openid);
  }

  @Transactional
  public Map<String, Object> join(Map<String, Object> body) {
    String openid = openid();
    userRepository.ensureUser(openid);
    String inviteCode = str(body.get("inviteCode")).trim().toUpperCase();
    if (inviteCode.length() != 6) {
      throw ApiException.of(ErrorCodes.INVALID_CODE, "邀请码无效");
    }
    FamilyRow family =
        familyRepository
            .findByInviteCode(inviteCode)
            .orElseThrow(() -> ApiException.of(ErrorCodes.INVALID_CODE, "邀请码无效"));
    if (membershipRepository.exists(openid, family.id())) {
      throw ApiException.of(ErrorCodes.ALREADY_IN_FAMILY, "已在该家庭中");
    }
    assertUserFamilyCapacity(openid);
    assertMemberCapacity(family.id(), family);

    Timestamp now = TimeJson.nowTs();
    membershipRepository.insert(openid, family.id(), now);
    familyRepository.incrementMemberCount(family.id(), 1);
    userRepository.setCurrentFamily(openid, family.id());

    FamilyRow updated = familyRepository.findById(family.id()).orElseThrow();
    return withCapacity(updated, openid);
  }

  public Map<String, Object> getMyFamily() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    FamilyRow family =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    Map<String, Object> data = withCapacity(family, openid);
    data.put("profile", profileOf(user));
    return data;
  }

  public Map<String, Object> listMyFamilies() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    return buildFamilyListBundle(user, false);
  }

  public Map<String, Object> page() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    Map<String, Object> bundle = buildFamilyListBundle(user, true);
    String currentId = (String) bundle.get("currentFamilyId");
    if (currentId == null) {
      bundle.put("members", List.of());
    } else {
      bundle.put("members", listMembersInternal(currentId, openid, user).get("list"));
    }
    return bundle;
  }

  private Map<String, Object> buildFamilyListBundle(UserRow user, boolean forPage) {
    String openid = user.openid();
    String currentFamilyId = user.currentFamilyId();
    List<MembershipRow> memberships = membershipRepository.listByOpenid(openid);
    List<String> ids = memberships.stream().map(MembershipRow::familyId).toList();
    Map<String, FamilyRow> byId = new HashMap<>();
    for (FamilyRow f : familyRepository.findByIds(ids)) {
      byId.put(f.id(), f);
    }
    Map<String, Timestamp> joinedAt = new HashMap<>();
    for (MembershipRow m : memberships) {
      joinedAt.put(m.familyId(), m.joinedAt());
    }

    List<Map<String, Object>> list = new ArrayList<>();
    for (String id : ids) {
      FamilyRow fam = byId.get(id);
      if (fam == null) {
        continue;
      }
      Map<String, Object> item = familySummary(fam, openid);
      item.put("joinedAt", TimeJson.toEpochMs(joinedAt.get(id)));
      item.put("isCurrent", id.equals(currentFamilyId));
      list.add(item);
    }

    Map<String, Object> out = new LinkedHashMap<>();
    if (currentFamilyId != null && byId.containsKey(currentFamilyId)) {
      out.put("currentFamilyId", currentFamilyId);
      out.put("family", withCapacity(byId.get(currentFamilyId), openid));
    } else {
      out.put("currentFamilyId", null);
      out.put("family", null);
    }
    out.put("list", list);
    out.put("profile", profileOf(user));
    if (forPage && !out.containsKey("members")) {
      // filled by page()
    }
    return out;
  }

  public Map<String, Object> listMembers() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return listMembersInternal(familyId, openid, user);
  }

  private Map<String, Object> listMembersInternal(String familyId, String openid, UserRow me) {
    FamilyRow family =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    List<MembershipRow> members = membershipRepository.listByFamilyId(familyId, 50);
    List<String> openids = members.stream().map(MembershipRow::openid).toList();
    Map<String, UserRow> users = new HashMap<>();
    for (UserRow u : userRepository.findByOpenids(openids)) {
      users.put(u.openid(), u);
    }
    List<Map<String, Object>> list = new ArrayList<>();
    for (MembershipRow m : members) {
      UserRow u = users.get(m.openid());
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("openid", m.openid());
      row.put("nickname", u == null || u.nickname() == null ? "" : u.nickname());
      row.put("avatarUrl", u == null || u.avatarUrl() == null ? "" : u.avatarUrl());
      row.put("isOwner", family.ownerOpenid().equals(m.openid()));
      row.put("isMe", openid.equals(m.openid()));
      row.put("joinedAt", TimeJson.toEpochMs(m.joinedAt()));
      list.add(row);
    }
    list.sort(
        Comparator.comparing((Map<String, Object> r) -> !Boolean.TRUE.equals(r.get("isOwner")))
            .thenComparing(r -> !Boolean.TRUE.equals(r.get("isMe")))
            .thenComparing(r -> r.get("joinedAt") == null ? 0L : (Long) r.get("joinedAt")));

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("list", list);
    out.put("profile", profileOf(me));
    return out;
  }

  @Transactional
  public Map<String, Object> updateProfile(Map<String, Object> body) {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    boolean hasNick = body.containsKey("nickname");
    boolean hasAvatar = body.containsKey("avatarFileID") || body.containsKey("avatarUrl");
    if (!hasNick && !hasAvatar) {
      throw ApiException.of(ErrorCodes.INVALID_PROFILE, "无有效资料字段");
    }
    String nickname = user.nickname() == null ? "" : user.nickname();
    String avatarUrl = user.avatarUrl() == null ? "" : user.avatarUrl();
    if (hasNick) {
      nickname = str(body.get("nickname")).trim();
      if (nickname.length() > 20) {
        throw ApiException.of(ErrorCodes.INVALID_NICKNAME, "昵称过长");
      }
    }
    if (hasAvatar) {
      Object raw =
          body.containsKey("avatarFileID") ? body.get("avatarFileID") : body.get("avatarUrl");
      avatarUrl = str(raw).trim();
      if (!avatarUrl.isEmpty() && !isAllowedAvatarRef(avatarUrl)) {
        throw ApiException.of(ErrorCodes.INVALID_AVATAR, "头像地址无效");
      }
    }
    userRepository.updateProfile(openid, nickname, avatarUrl);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("nickname", nickname);
    out.put("avatarUrl", avatarUrl);
    return out;
  }

  @Transactional
  public Map<String, Object> switchFamily(Map<String, Object> body) {
    String openid = openid();
    userRepository.ensureUser(openid);
    String familyId = str(body.get("familyId")).trim();
    if (familyId.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_FAMILY, "家庭无效");
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NOT_MEMBER, "未加入该家庭");
    }
    FamilyRow family =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    userRepository.setCurrentFamily(openid, familyId);
    return withCapacity(family, openid);
  }

  @Transactional
  public Map<String, Object> updateBackground(Map<String, Object> body) {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = requireCurrentFamilyId(user);
    String type = str(body.get("type"));
    if (type.isEmpty()) {
      type = "theme";
    }
    String value = str(body.containsKey("value") ? body.get("value") : body.get("themeId")).trim();
    if (!"theme".equals(type) || !ThemeIds.isValidTheme(value)) {
      throw ApiException.of(ErrorCodes.INVALID_BACKGROUND, "主题无效");
    }
    FamilyRow before =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    Map<String, Object> background = Map.of("type", "theme", "value", value);
    familyRepository.updateBackground(familyId, toJson(background));
    FamilyRow fam = familyRepository.findById(familyId).orElse(before);
    return familySummary(fam, openid);
  }

  @Transactional
  public Map<String, Object> updateName(Map<String, Object> body) {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入家庭名称");
    }
    if (name.length() > 20) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "家庭名称过长");
    }
    String familyId = str(body.get("familyId")).trim();
    if (familyId.isEmpty()) {
      familyId = requireCurrentFamilyId(user);
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    familyRepository.updateName(familyId, name);
    FamilyRow fam =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    return familySummary(fam, openid);
  }

  @Transactional
  public Map<String, Object> updateExpireReminder(Map<String, Object> body) {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = requireCurrentFamilyId(user);
    boolean enabled = asTruthy(body.get("enabled"));
    familyRepository.updateExpireReminder(familyId, enabled);
    FamilyRow fam =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    return familySummary(fam, openid);
  }

  @Transactional
  public Map<String, Object> recordSubscribeExpire() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = requireCurrentFamilyId(user);
    membershipRepository.recordSubscribeExpire(openid, familyId, TimeJson.nowTs());
    return Map.of("granted", true);
  }

  public Map<String, Object> getEntitlement() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = requireCurrentFamilyId(user);
    FamilyRow family =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    EffectiveEntitlement e = entitlementService.resolveForFamily(familyId);
    Integer itemCount = family.itemCount();
    int memberCount = family.memberCount();
    Map<String, Object> out = new LinkedHashMap<>(CapacityPlans.toEntitlementMap(e));
    out.put("itemCount", itemCount);
    out.put("memberCount", memberCount);
    out.put(
        "remaining",
        e.itemLimit() == null || itemCount == null ? null : Math.max(0, e.itemLimit() - itemCount));
    out.put(
        "memberRemaining",
        e.memberLimit() == null ? null : Math.max(0, e.memberLimit() - memberCount));
    return out;
  }

  @Transactional
  public Map<String, Object> redeem(Map<String, Object> body) {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = requireCurrentFamilyId(user);
    String normalized = CapacityPlans.normalizeCode(str(body.get("code")));
    if (normalized.length() < 8) {
      throw ApiException.of(ErrorCodes.INVALID_CODE, "兑换码无效");
    }
    String hash = CapacityPlans.hashCode(normalized);
    var codeRow =
        redeemCodeRepository
            .findByHash(hash)
            .orElseThrow(() -> ApiException.of(ErrorCodes.INVALID_CODE, "兑换码无效"));
    if ("revoked".equals(codeRow.status())) {
      throw ApiException.of(ErrorCodes.CODE_REVOKED, "兑换码已作废");
    }
    if ("used".equals(codeRow.status())) {
      throw ApiException.of(ErrorCodes.CODE_USED, "兑换码已使用");
    }
    Timestamp now = TimeJson.nowTs();
    if (!redeemCodeRepository.markUsed(hash, familyId, openid, now)) {
      throw ApiException.of(ErrorCodes.CODE_USED, "兑换码已使用");
    }

    long base = now.getTime();
    var existing = subscriptionRepository.findByFamilyId(familyId);
    if (existing.isPresent() && existing.get().expiresAt() != null) {
      long exp = existing.get().expiresAt().getTime();
      if (exp > base) {
        base = exp;
      }
    }
    Long previousHosted =
        existing
            .map(row -> row.hostedModelUntil() == null ? null : row.hostedModelUntil().getTime())
            .orElse(null);
    long expiresAtMs = base + TimeUnit.DAYS.toMillis(codeRow.days());
    Timestamp expiresAt = new Timestamp(expiresAtMs);
    subscriptionRepository.upsert(
        familyId, codeRow.planId(), codeRow.product(), "redeem", expiresAt, hash);
    if (codeRow.hostedModel()) {
      long hostedUntilMs = HostedModelRules.extendUntil(previousHosted, now.getTime(), codeRow.days());
      subscriptionRepository.updateHostedModelUntil(familyId, new Timestamp(hostedUntilMs));
    }

    EffectiveEntitlement e = entitlementService.resolveForFamily(familyId);
    familyRepository.updateEntitlementJson(familyId, toJson(CapacityPlans.toEntitlementMap(e)));

    FamilyRow family = familyRepository.findById(familyId).orElseThrow();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("family", withCapacity(family, openid));
    out.put("entitlement", CapacityPlans.toEntitlementMap(e));
    out.put("expiresAt", expiresAtMs);
    out.put("planId", codeRow.planId());
    out.put("days", codeRow.days());
    return out;
  }

  @Transactional
  public Map<String, Object> issueCodes(Map<String, Object> body) {
    String openid = openid();
    if (!entitlementService.isCapacityAdmin(openid)) {
      throw ApiException.of(ErrorCodes.FORBIDDEN, "无权限");
    }
    String productId = str(body.get("product")).trim();
    if (productId.isEmpty()) {
      productId = "capacity_90d";
    }
    ProductDef product = CapacityPlans.PRODUCTS.get(productId);
    if (product == null) {
      throw ApiException.of(ErrorCodes.INVALID_PRODUCT, "产品无效");
    }
    int days = product.days();
    if (body.get("durationAmount") != null && body.get("durationUnit") != null) {
      try {
        int amount = Integer.parseInt(String.valueOf(body.get("durationAmount")));
        String unit = str(body.get("durationUnit")).toLowerCase();
        if (amount <= 0) {
          throw ApiException.of(ErrorCodes.INVALID_DURATION, "时长无效");
        }
        days =
            switch (unit) {
              case "d", "day", "days" -> amount;
              case "m", "month", "months" -> amount * 30;
              case "y", "year", "years" -> amount * 365;
              default -> throw ApiException.of(ErrorCodes.INVALID_DURATION, "时长单位无效");
            };
      } catch (NumberFormatException e) {
        throw ApiException.of(ErrorCodes.INVALID_DURATION, "时长无效");
      }
    }
    int count = 1;
    if (body.get("count") != null) {
      try {
        count = Integer.parseInt(String.valueOf(body.get("count")));
      } catch (NumberFormatException e) {
        count = 1;
      }
    }
    if (count < 1 || count > 50) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "数量须在 1–50");
    }
    String note = str(body.get("note"));
    boolean hostedModel = HostedModelRules.flag(body.get("hostedModel"));
    List<String> codes = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      String plain = generatePlainCode();
      redeemCodeRepository.insert(
          CapacityPlans.hashCode(plain), productId, days, product.planId(), hostedModel, note);
      codes.add(formatPlainCode(plain));
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("product", productId);
    out.put("days", days);
    out.put("planId", product.planId());
    out.put("hostedModel", hostedModel);
    out.put("count", count);
    out.put("codes", codes);
    return out;
  }

  @Transactional
  public Map<String, Object> leave() {
    String openid = openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = requireCurrentFamilyId(user);
    FamilyRow family =
        familyRepository
            .findById(familyId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NO_FAMILY, "家庭不存在"));
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }

    boolean isOwner = family.ownerOpenid().equals(openid);
    String nextFamilyId =
        membershipRepository.pickOtherFamilyId(openid, familyId).orElse(null);

    if (isOwner) {
      // Capture next-family for everyone currently pointing at this home BEFORE membership wipe.
      List<String> affected = userRepository.listOpenidsWithCurrentFamily(familyId);
      Map<String, String> nextByUser = new LinkedHashMap<>();
      for (String uid : affected) {
        nextByUser.put(
            uid, membershipRepository.pickOtherFamilyId(uid, familyId).orElse(null));
      }
      structureRepository.dissolveFamilyData(familyId);
      membershipRepository.deleteByFamily(familyId);
      familyRepository.delete(familyId);
      for (Map.Entry<String, String> e : nextByUser.entrySet()) {
        userRepository.setCurrentFamily(e.getKey(), e.getValue());
      }
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("dissolved", true);
      out.put("nextFamilyId", nextByUser.getOrDefault(openid, nextFamilyId));
      return out;
    }

    structureRepository.deleteExpireSubsForMember(familyId, openid);
    membershipRepository.delete(openid, familyId);
    familyRepository.incrementMemberCount(familyId, -1);
    userRepository.setCurrentFamily(openid, nextFamilyId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("left", true);
    out.put("nextFamilyId", nextFamilyId);
    return out;
  }

  private String requireCurrentFamilyId(UserRow user) {
    String familyId = user.currentFamilyId();
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(user.openid(), familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return familyId;
  }

  /** https / cloud:// / object key（如 avatar/openid/...）；拒绝对明显 junk。 */
  private static boolean isAllowedAvatarRef(String s) {
    if (s.startsWith("cloud://") || s.startsWith("http://") || s.startsWith("https://")) {
      return true;
    }
    // object key: no scheme, has path segment
    if (!s.contains("://") && s.indexOf('/') > 0 && !s.startsWith("/")) {
      return true;
    }
    return false;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }

  private static boolean asTruthy(Object v) {
    if (v instanceof Boolean b) {
      return b;
    }
    if (v instanceof Number n) {
      return n.intValue() != 0;
    }
    String s = str(v).trim().toLowerCase();
    return "true".equals(s) || "1".equals(s);
  }

  private static String generatePlainCode() {
    StringBuilder sb = new StringBuilder(12);
    for (int i = 0; i < 12; i++) {
      sb.append(INVITE_ALPHABET.charAt(RANDOM.nextInt(INVITE_ALPHABET.length())));
    }
    return sb.toString();
  }

  private static String formatPlainCode(String plain) {
    // XXXX-XXXX-XXXX
    return plain.substring(0, 4) + "-" + plain.substring(4, 8) + "-" + plain.substring(8, 12);
  }
}
