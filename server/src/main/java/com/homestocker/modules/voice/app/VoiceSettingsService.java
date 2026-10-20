package com.homestocker.modules.voice.app;

import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.FamilyAccess;
import com.homestocker.common.FamilyContext;
import com.homestocker.modules.ai.app.AiKeyService;
import com.homestocker.modules.ai.app.PlatformKeyService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 朗读配置：按家庭保存模型、音色和密钥指针。
 *
 * <p>密钥解析三档递进：家庭设置里指定的 MiMo 密钥 → 家庭第一把 MiMo 密钥 → 平台池 MiMo 密钥。
 * 三档都没有才算不可用，前端据此隐藏朗读入口，而不是等用户点了再报错。
 *
 * <p>为什么单独一张表：朗读用的是 {@code family_voice_settings}，与管家对话的密钥选择解耦，
 * 改管家模型不会把朗读一起改坏。
 */
@Service
public class VoiceSettingsService {

  /** 解析结果：模型、密钥、音色，外加密钥来源（family / platform）。 */
  public record Resolution(String model, AiKeyService.KeyRow key, String voice, String source) {}

  private record Row(String keyId, String model, String voice) {}

  private record Picked(AiKeyService.KeyRow key, String source) {}

  private static final String DEFAULT_VOICE = "mimo_default";

  private static final String SELECT =
      "SELECT key_id, model, voice FROM family_voice_settings WHERE family_id = ?";

  private static final String UPSERT =
      "INSERT INTO family_voice_settings (family_id, key_id, model, voice, updated_at)"
          + " VALUES (?, ?, ?, ?, now())"
          + " ON CONFLICT (family_id) DO UPDATE"
          + " SET key_id = EXCLUDED.key_id, model = EXCLUDED.model,"
          + " voice = EXCLUDED.voice, updated_at = now()";

  private final JdbcTemplate jdbc;
  private final FamilyAccess familyAccess;
  private final AiKeyService aiKeyService;
  private final PlatformKeyService platformKeyService;

  public VoiceSettingsService(
      JdbcTemplate jdbc,
      FamilyAccess familyAccess,
      AiKeyService aiKeyService,
      PlatformKeyService platformKeyService) {
    this.jdbc = jdbc;
    this.familyAccess = familyAccess;
    this.aiKeyService = aiKeyService;
    this.platformKeyService = platformKeyService;
  }

  /**
   * 解析当前家庭这次朗读要用的模型、密钥与音色。
   *
   * <p>必须在请求线程调用：{@code FamilyAccess} 依赖 ThreadLocal。
   */
  public Resolution resolveCurrent(String requestedVoice) {
    return resolve(familyAccess.requireCurrentFamily().familyId(), requestedVoice);
  }

  /** 指定家庭的解析，供已持有 familyId 的调用方使用。 */
  public Resolution resolve(String familyId, String requestedVoice) {
    Row row = find(familyId);
    String model = modelOf(row);
    Picked picked = pickKey(familyId, row == null ? null : row.keyId());
    if (picked == null) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "语音朗读暂不可用：家庭和平台都没有 MiMo 密钥");
    }
    String voice = firstNonBlank(row == null ? null : row.voice(), requestedVoice, DEFAULT_VOICE);
    return new Resolution(model, picked.key(), voice, picked.source());
  }

  /** 朗读是否可用，供前端决定要不要显示喇叭。不抛异常。 */
  public Map<String, Object> capability() {
    FamilyContext family = familyAccess.requireCurrentFamily();
    String familyId = family.familyId();
    Row row = find(familyId);
    String model = modelOf(row);
    Picked picked = pickKey(familyId, row == null ? null : row.keyId());

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("available", picked != null);
    out.put("source", picked == null ? "none" : picked.source());
    out.put("model", model);
    out.put("modelLabel", VoiceTtsModels.labelOf(model));
    out.put("voice", firstNonBlank(row == null ? null : row.voice(), "", DEFAULT_VOICE));
    if (picked == null) {
      out.put("reason", "家庭和平台都没有可用的 MiMo 密钥");
    }
    return out;
  }

  /** 设置页读取：同时给出已保存值与生效值，前端不用自己算回退。 */
  public Map<String, Object> read() {
    FamilyContext family = familyAccess.requireCurrentFamily();
    String familyId = family.familyId();
    Row row = find(familyId);
    List<AiKeyService.KeyRow> keys = mimoKeys(familyId);

    String model = modelOf(row);
    Picked picked = pickKey(familyId, row == null ? null : row.keyId());

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("model", model);
    out.put("modelLabel", VoiceTtsModels.labelOf(model));
    out.put("voice", row == null ? "" : row.voice());
    out.put("keyId", row == null ? null : row.keyId());
    out.put("models", VoiceTtsModels.options());
    out.put("available", picked != null);
    out.put("source", picked == null ? "none" : picked.source());
    out.put(
        "keys",
        keys.stream()
            .map(
                key -> {
                  Map<String, Object> item = new LinkedHashMap<>();
                  item.put("id", key.id());
                  item.put("label", key.label());
                  item.put("model", key.model());
                  return item;
                })
            .toList());

    if (picked != null) {
      Map<String, Object> effectiveView = new LinkedHashMap<>();
      effectiveView.put("model", model);
      effectiveView.put("modelLabel", VoiceTtsModels.labelOf(model));
      effectiveView.put("keyId", picked.key().id());
      effectiveView.put("keyLabel", picked.key().label());
      effectiveView.put(
          "voice", firstNonBlank(row == null ? null : row.voice(), "", DEFAULT_VOICE));
      effectiveView.put("source", picked.source());
      out.put("effective", effectiveView);
    }
    return out;
  }

  /** 保存设置。模型必须在朗读白名单内；密钥只接受本家庭的 MiMo 密钥。 */
  public void save(String model, String voice, String keyId) {
    FamilyContext family = familyAccess.requireCurrentFamily();
    String familyId = family.familyId();

    String normalizedModel = trimToNull(model);
    if (normalizedModel == null) {
      normalizedModel = VoiceTtsModels.DEFAULT;
    }
    if (!VoiceTtsModels.isAllowed(normalizedModel)) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "这个模型不支持朗读，换一个试试");
    }

    String normalizedKeyId = trimToNull(keyId);
    String targetKeyId = normalizedKeyId;
    if (targetKeyId != null
        && mimoKeys(familyId).stream().noneMatch(key -> key.id().equals(targetKeyId))) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "所选密钥不属于当前家庭，或者不是 MiMo 密钥");
    }

    String normalizedVoice = voice == null ? "" : voice.trim();
    String savedModel = normalizedModel;
    jdbc.update(
        UPSERT,
        ps -> {
          ps.setString(1, familyId);
          ps.setString(2, targetKeyId);
          ps.setString(3, savedModel);
          ps.setString(4, normalizedVoice);
        });
  }

  private Row find(String familyId) {
    List<Row> rows =
        jdbc.query(
            SELECT,
            (rs, index) ->
                new Row(rs.getString("key_id"), rs.getString("model"), rs.getString("voice")),
            familyId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  /** 存的是朗读模型；不是白名单里的值（含历史遗留的对话模型）一律回退默认。 */
  private static String modelOf(Row row) {
    String saved = row == null ? null : row.model();
    return VoiceTtsModels.isAllowed(saved) ? saved : VoiceTtsModels.DEFAULT;
  }

  private List<AiKeyService.KeyRow> mimoKeys(String familyId) {
    return aiKeyService.listForFamily(familyId).stream()
        .filter(key -> "mimo".equals(key.provider()))
        .toList();
  }

  /** 指针优先；指针失效或被删就退回第一把家庭 MiMo 密钥；都没有再看平台池。 */
  private Picked pickKey(String familyId, String keyId) {
    List<AiKeyService.KeyRow> keys = mimoKeys(familyId);
    if (keyId != null) {
      for (AiKeyService.KeyRow key : keys) {
        if (key.id().equals(keyId)) {
          return new Picked(key, "family");
        }
      }
    }
    if (!keys.isEmpty()) {
      return new Picked(keys.get(0), "family");
    }
    for (AiKeyService.KeyRow key : platformKeyService.listEnabledForCall()) {
      if ("mimo".equals(key.provider())) {
        return new Picked(key, "platform");
      }
    }
    return null;
  }

  private static String firstNonBlank(String first, String second, String fallback) {
    if (first != null && !first.isBlank()) {
      return first;
    }
    if (second != null && !second.isBlank()) {
      return second;
    }
    return fallback;
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
