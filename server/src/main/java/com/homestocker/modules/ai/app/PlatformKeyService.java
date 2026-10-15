package com.homestocker.modules.ai.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import com.homestocker.modules.family.app.EntitlementService;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlatformKeyService {

  public record PlatformKeyRow(
      String id,
      String provider,
      String label,
      String model,
      String apiKey,
      int position,
      boolean enabled,
      Timestamp createdAt) {}

  private static final RowMapper<PlatformKeyRow> ROW =
      (rs, i) ->
          new PlatformKeyRow(
              rs.getString("id"),
              rs.getString("provider"),
              rs.getString("label"),
              rs.getString("model"),
              rs.getString("api_key"),
              rs.getInt("position"),
              rs.getBoolean("enabled"),
              rs.getTimestamp("created_at"));

  private final JdbcTemplate jdbc;
  private final EntitlementService entitlementService;

  public PlatformKeyService(JdbcTemplate jdbc, EntitlementService entitlementService) {
    this.jdbc = jdbc;
    this.entitlementService = entitlementService;
  }

  public List<KeyRow> listEnabledForCall() {
    List<KeyRow> out = new ArrayList<>();
    for (PlatformKeyRow row : listRows()) {
      if (!row.enabled()) {
        continue;
      }
      ModelCatalog.Resolved preset = ModelCatalog.resolve(row.provider(), row.model());
      out.add(
          new KeyRow(
              row.id(),
              "",
              preset.provider(),
              row.label(),
              preset.baseUrl(),
              preset.model(),
              row.apiKey(),
              false,
              row.createdAt()));
    }
    return out;
  }

  public Map<String, Object> listKeys() {
    requireAdmin();
    List<Map<String, Object>> list = new ArrayList<>();
    for (PlatformKeyRow row : listRows()) {
      list.add(view(row));
    }
    return Map.of("list", list, "presets", ModelCatalog.clientPresets());
  }

  @Transactional
  public Map<String, Object> addKey(Map<String, Object> body) {
    requireAdmin();
    Integer count = jdbc.queryForObject("SELECT COUNT(1) FROM platform_ai_keys", Integer.class);
    if (count != null && count >= PlatformKeyFailover.MAX_POOL) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "平台模型最多 " + PlatformKeyFailover.MAX_POOL + " 把");
    }
    String apiKey = str(body.get("apiKey")).trim();
    if (apiKey.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "请填写 API Key");
    }
    ModelCatalog.Resolved preset =
        ModelCatalog.resolve(str(body.get("provider")), str(body.get("model")));
    String label =
        str(body.get("label")).trim().isEmpty() ? preset.providerLabel() : str(body.get("label")).trim();
    Integer maxPos =
        jdbc.queryForObject("SELECT COALESCE(MAX(position), 0) FROM platform_ai_keys", Integer.class);
    String id = UUID.randomUUID().toString();
    jdbc.update(
        """
        INSERT INTO platform_ai_keys (
          id, provider, label, model, api_key, position, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, TRUE, now(), now())
        """,
        id,
        preset.provider(),
        label,
        preset.model(),
        apiKey,
        (maxPos == null ? 0 : maxPos) + 1);
    return view(requireRow(id));
  }

  @Transactional
  public Map<String, Object> removeKey(Map<String, Object> body) {
    requireAdmin();
    String keyId = keyId(body);
    requireRow(keyId);
    jdbc.update("DELETE FROM platform_ai_keys WHERE id = ?", keyId);
    return Map.of("removed", true, "keyId", keyId);
  }

  @Transactional
  public Map<String, Object> setEnabled(Map<String, Object> body) {
    requireAdmin();
    String keyId = keyId(body);
    requireRow(keyId);
    boolean enabled = HostedFlag.enabled(body.get("enabled"));
    jdbc.update(
        "UPDATE platform_ai_keys SET enabled = ?, updated_at = now() WHERE id = ?",
        enabled,
        keyId);
    return view(requireRow(keyId));
  }

  @Transactional
  public Map<String, Object> moveKey(Map<String, Object> body) {
    requireAdmin();
    String keyId = keyId(body);
    String direction = str(body.get("direction")).trim();
    List<PlatformKeyRow> rows = listRows();
    int index = -1;
    for (int i = 0; i < rows.size(); i++) {
      if (rows.get(i).id().equals(keyId)) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      throw ApiException.of(ErrorCodes.NOT_FOUND, "密钥不存在");
    }
    int swap = "up".equals(direction) ? index - 1 : "down".equals(direction) ? index + 1 : -1;
    if (swap < 0 || swap >= rows.size()) {
      return view(rows.get(index));
    }
    PlatformKeyRow a = rows.get(index);
    PlatformKeyRow b = rows.get(swap);
    jdbc.update("UPDATE platform_ai_keys SET position = ?, updated_at = now() WHERE id = ?", b.position(), a.id());
    jdbc.update("UPDATE platform_ai_keys SET position = ?, updated_at = now() WHERE id = ?", a.position(), b.id());
    return view(requireRow(keyId));
  }

  private List<PlatformKeyRow> listRows() {
    return jdbc.query(
        "SELECT * FROM platform_ai_keys ORDER BY position ASC, created_at ASC", ROW);
  }

  private PlatformKeyRow requireRow(String id) {
    return jdbc.query("SELECT * FROM platform_ai_keys WHERE id = ?", ROW, id).stream()
        .findFirst()
        .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "密钥不存在"));
  }

  private void requireAdmin() {
    requireAdmin(entitlementService.isCapacityAdmin(RequestContext.require().openid()));
  }

  static void requireAdmin(boolean admin) {
    if (!admin) {
      throw ApiException.of(ErrorCodes.FORBIDDEN, "无权限");
    }
  }

  private Map<String, Object> view(PlatformKeyRow row) {
    ModelCatalog.Resolved preset = ModelCatalog.resolve(row.provider(), row.model());
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", row.id());
    m.put("provider", preset.provider());
    m.put("providerLabel", preset.providerLabel());
    m.put("label", row.label());
    m.put("model", preset.model());
    m.put("apiKeyMasked", mask(row.apiKey()));
    m.put("enabled", row.enabled());
    m.put("position", row.position());
    m.put("createdAt", TimeJson.toEpochMs(row.createdAt()));
    return m;
  }

  static String mask(String apiKey) {
    if (apiKey == null || apiKey.length() < 8) {
      return "****";
    }
    return apiKey.substring(0, 3) + "****" + apiKey.substring(apiKey.length() - 4);
  }

  private static String keyId(Map<String, Object> body) {
    String keyId = str(body.get("keyId")).trim();
    if (keyId.isEmpty()) {
      keyId = str(body.get("id")).trim();
    }
    if (keyId.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "缺少密钥");
    }
    return keyId;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }

  /** enabled defaults to true when the field is omitted. */
  static final class HostedFlag {
    private HostedFlag() {}

    static boolean enabled(Object raw) {
      if (raw == null) {
        return true;
      }
      if (raw instanceof Boolean b) {
        return b;
      }
      String text = String.valueOf(raw).trim();
      return !("false".equalsIgnoreCase(text) || "0".equals(text));
    }
  }
}
