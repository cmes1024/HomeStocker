package com.homestocker.modules.ai.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.SubscriptionRepository;
import com.homestocker.infra.jdbc.SubscriptionRow;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.domain.HostedModelRules;
import com.homestocker.modules.family.domain.HostedModelRules.Decision;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiKeyService {

  private static final int MAX_KEYS = 3;

  public record KeyRow(
      String id,
      String familyId,
      String provider,
      String label,
      String baseUrl,
      String model,
      String apiKey,
      boolean isDefault,
      Timestamp createdAt) {}

  private static final RowMapper<KeyRow> ROW =
      (rs, i) ->
          new KeyRow(
              rs.getString("id"),
              rs.getString("family_id"),
              rs.getString("provider"),
              rs.getString("label"),
              rs.getString("base_url"),
              rs.getString("model"),
              rs.getString("api_key"),
              rs.getBoolean("is_default"),
              rs.getTimestamp("created_at"));

  private final JdbcTemplate jdbc;
  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final SubscriptionRepository subscriptionRepository;
  private final PlatformKeyService platformKeyService;

  public AiKeyService(
      JdbcTemplate jdbc,
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      SubscriptionRepository subscriptionRepository,
      PlatformKeyService platformKeyService) {
    this.jdbc = jdbc;
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.platformKeyService = platformKeyService;
  }

  private record Ctx(String openid, String familyId) {}

  private Ctx requireFamily() {
    String openid = RequestContext.require().openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null
        || familyId.isBlank()
        || !membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return new Ctx(openid, familyId);
  }

  private static String mask(String apiKey) {
    if (apiKey == null || apiKey.length() < 8) {
      return "****";
    }
    return apiKey.substring(0, 3) + "****" + apiKey.substring(apiKey.length() - 4);
  }

  private Map<String, Object> view(KeyRow k, boolean isDefault) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", k.id());
    m.put("provider", k.provider());
    m.put("providerLabel", ModelCatalog.providerLabel(k.provider()));
    m.put("label", k.label());
    m.put("baseUrl", k.baseUrl());
    m.put("model", ModelCatalog.callModel(k.provider(), k.model()));
    m.put("apiKeyMasked", mask(k.apiKey()));
    m.put("isDefault", isDefault);
    m.put("createdAt", TimeJson.toEpochMs(k.createdAt()));
    return m;
  }

  /** Ordered for act: default first, then created_at asc. Includes raw apiKey (server only). */
  public List<KeyRow> listOrderedRawKeys() {
    return listForFamily(requireFamily().familyId());
  }

  public List<KeyRow> listForFamily(String familyId) {
    return jdbc.query(
        """
        SELECT * FROM family_ai_keys WHERE family_id = ?
        ORDER BY is_default DESC, created_at ASC
        """,
        ROW,
        familyId);
  }

  public Map<String, Object> listKeys() {
    Ctx ctx = requireFamily();
    List<KeyRow> keys = listForFamily(ctx.familyId());
    SubscriptionRow sub = subscriptionRepository.findByFamilyId(ctx.familyId()).orElse(null);
    long now = System.currentTimeMillis();
    Long until = ActKeyResolver.hostedUntilMs(sub);
    Decision decision =
        HostedModelRules.decide(
            sub == null ? null : sub.modelSource(), until, now, !keys.isEmpty());
    boolean hostedDefault = decision.hostedIsDefault();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put(
        "list",
        keys.stream().map(k -> view(k, !hostedDefault && k.isDefault())).toList());
    out.put("presets", ModelCatalog.clientPresets());
    // 按图预填可用性：与 ActKeyResolver.select 的取密钥口径保持一致——
    // hosted 在档时 capture 只会拿到池子里的密钥，否则只拿家庭密钥，两者互斥。
    boolean visionAvailable =
        hostedDefault
            ? platformKeyService.listEnabledForCall().stream()
                .anyMatch(k -> ModelCatalog.isVision(k.provider(), k.model()))
            : keys.stream().anyMatch(k -> ModelCatalog.isVision(k.provider(), k.model()));
    out.put("visionAvailable", visionAvailable);
    if (decision.visible()) {
      Map<String, Object> hosted = new LinkedHashMap<>();
      hosted.put("active", decision.active());
      hosted.put("expired", !decision.active());
      hosted.put("expiresAt", until);
      hosted.put("isDefault", hostedDefault);
      out.put("hosted", hosted);
    }
    return out;
  }

  @Transactional
  public Map<String, Object> addKey(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM family_ai_keys WHERE family_id = ?",
            Integer.class,
            ctx.familyId());
    if (count != null && count >= MAX_KEYS) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "最多保存 " + MAX_KEYS + " 把密钥");
    }
    String apiKey = str(body.get("apiKey")).trim();
    if (apiKey.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "请填写 API Key");
    }
    ModelCatalog.Resolved preset =
        ModelCatalog.resolve(str(body.get("provider")), str(body.get("model")));
    String provider = preset.provider();
    String label = str(body.get("label")).trim().isEmpty() ? preset.providerLabel() : str(body.get("label")).trim();
    String baseUrl = preset.baseUrl();
    String model = preset.model();
    boolean makeDefault = count == null || count == 0 || Boolean.TRUE.equals(body.get("isDefault"));
    if (makeDefault) {
      jdbc.update(
          "UPDATE family_ai_keys SET is_default = FALSE WHERE family_id = ?", ctx.familyId());
    }
    String id = UUID.randomUUID().toString();
    jdbc.update(
        """
        INSERT INTO family_ai_keys (
          id, family_id, provider, label, base_url, model, api_key, is_default,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
        """,
        id,
        ctx.familyId(),
        provider,
        label,
        baseUrl,
        model,
        apiKey,
        makeDefault,
        ctx.openid());
    KeyRow row =
        jdbc.query("SELECT * FROM family_ai_keys WHERE id = ?", ROW, id).stream()
            .findFirst()
            .orElseThrow();
    return view(row, row.isDefault());
  }

  @Transactional
  public Map<String, Object> removeKey(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String keyId = str(body.get("keyId")).trim();
    if (keyId.isEmpty()) {
      keyId = str(body.get("id")).trim();
    }
    KeyRow row =
        jdbc
            .query(
                "SELECT * FROM family_ai_keys WHERE id = ? AND family_id = ?",
                ROW,
                keyId,
                ctx.familyId())
            .stream()
            .findFirst()
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "密钥不存在"));
    jdbc.update("DELETE FROM family_ai_keys WHERE id = ?", keyId);
    List<KeyRow> rest =
        jdbc.query(
            "SELECT * FROM family_ai_keys WHERE family_id = ? ORDER BY created_at ASC",
            ROW,
            ctx.familyId());
    if (row.isDefault() && !rest.isEmpty()) {
      jdbc.update("UPDATE family_ai_keys SET is_default = TRUE WHERE id = ?", rest.get(0).id());
    }
    SubscriptionRow sub = subscriptionRepository.findByFamilyId(ctx.familyId()).orElse(null);
    long now = System.currentTimeMillis();
    Long until = ActKeyResolver.hostedUntilMs(sub);
    boolean hostedActive = until != null && until > now;
    String currentSource = sub == null ? null : sub.modelSource();
    String source =
        HostedModelRules.sourceAfterRemoval(
            !rest.isEmpty(), hostedActive, row.isDefault(), currentSource);
    if (source != null) {
      subscriptionRepository.updateModelSource(ctx.familyId(), source);
    }
    return Map.of("removed", true, "keyId", keyId);
  }

  @Transactional
  public Map<String, Object> setDefaultKey(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String keyId = str(body.get("keyId")).trim();
    if (keyId.isEmpty()) {
      keyId = str(body.get("id")).trim();
    }
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM family_ai_keys WHERE id = ? AND family_id = ?",
            Integer.class,
            keyId,
            ctx.familyId());
    if (n == null || n == 0) {
      throw ApiException.of(ErrorCodes.NOT_FOUND, "密钥不存在");
    }
    jdbc.update("UPDATE family_ai_keys SET is_default = FALSE WHERE family_id = ?", ctx.familyId());
    jdbc.update(
        "UPDATE family_ai_keys SET is_default = TRUE, updated_at = now() WHERE id = ?", keyId);
    subscriptionRepository.updateModelSource(ctx.familyId(), "family");
    return Map.of("ok", true, "keyId", keyId);
  }

  @Transactional
  public Map<String, Object> setHostedDefault() {
    Ctx ctx = requireFamily();
    SubscriptionRow sub =
        subscriptionRepository
            .findByFamilyId(ctx.familyId())
            .orElseThrow(() -> ApiException.of(ErrorCodes.BAD_REQUEST, "会员模型已到期"));
    long now = System.currentTimeMillis();
    Long until = ActKeyResolver.hostedUntilMs(sub);
    Decision decision = HostedModelRules.decide("hosted", until, now, true);
    if (!decision.active()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "会员模型已到期");
    }
    subscriptionRepository.updateModelSource(ctx.familyId(), "hosted");
    return Map.of("ok", true, "source", "hosted");
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
