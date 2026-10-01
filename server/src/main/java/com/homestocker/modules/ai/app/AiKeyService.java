package com.homestocker.modules.ai.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
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

  public AiKeyService(
      JdbcTemplate jdbc,
      UserRepository userRepository,
      MembershipRepository membershipRepository) {
    this.jdbc = jdbc;
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
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

  private Map<String, Object> view(KeyRow k) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", k.id());
    m.put("provider", k.provider());
    m.put("label", k.label());
    m.put("baseUrl", k.baseUrl());
    m.put("model", k.model());
    m.put("apiKeyMasked", mask(k.apiKey()));
    m.put("isDefault", k.isDefault());
    m.put("createdAt", TimeJson.toEpochMs(k.createdAt()));
    return m;
  }

  /** Ordered for act: default first, then created_at asc. Includes raw apiKey (server only). */
  public List<KeyRow> listOrderedRawKeys() {
    Ctx ctx = requireFamily();
    return jdbc.query(
        """
        SELECT * FROM family_ai_keys WHERE family_id = ?
        ORDER BY is_default DESC, created_at ASC
        """,
        ROW,
        ctx.familyId());
  }

  public Map<String, Object> listKeys() {
    Ctx ctx = requireFamily();
    List<KeyRow> keys =
        jdbc.query(
            """
            SELECT * FROM family_ai_keys WHERE family_id = ?
            ORDER BY is_default DESC, created_at ASC
            """,
            ROW,
            ctx.familyId());
    return Map.of("list", keys.stream().map(this::view).toList());
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
    String provider =
        str(body.get("provider")).trim().isEmpty() ? "deepseek" : str(body.get("provider")).trim();
    String label =
        str(body.get("label")).trim().isEmpty() ? "DeepSeek" : str(body.get("label")).trim();
    String baseUrl =
        str(body.get("baseUrl")).trim().isEmpty()
            ? "https://api.deepseek.com"
            : str(body.get("baseUrl")).trim();
    String model =
        str(body.get("model")).trim().isEmpty() ? "deepseek-chat" : str(body.get("model")).trim();
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
    return view(row);
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
    if (row.isDefault()) {
      List<KeyRow> rest =
          jdbc.query(
              "SELECT * FROM family_ai_keys WHERE family_id = ? ORDER BY created_at ASC LIMIT 1",
              ROW,
              ctx.familyId());
      if (!rest.isEmpty()) {
        jdbc.update(
            "UPDATE family_ai_keys SET is_default = TRUE WHERE id = ?", rest.get(0).id());
      }
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
    return Map.of("ok", true, "keyId", keyId);
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
