package com.homestocker.modules.ai.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiSeedService {

  private final JdbcTemplate jdbc;
  private final ObjectMapper objectMapper;

  public AiSeedService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
    this.jdbc = jdbc;
    this.objectMapper = objectMapper;
  }

  @Transactional
  public Map<String, Object> ensurePrompt() {
    Integer ver =
        jdbc.query(
            "SELECT version FROM ai_prompts WHERE id = ?",
            rs -> rs.next() ? rs.getInt(1) : null,
            AssistPromptTexts.ASSIST_PROMPT_ID);
    if (ver != null && ver >= AssistPromptTexts.ASSIST_PROMPT_VERSION) {
      return loadPrompt();
    }
    jdbc.update(
        """
        INSERT INTO ai_prompts (id, version, system_text, updated_at)
        VALUES (?, ?, ?, now())
        ON CONFLICT (id) DO UPDATE SET
          version = EXCLUDED.version,
          system_text = EXCLUDED.system_text,
          updated_at = now()
        """,
        AssistPromptTexts.ASSIST_PROMPT_ID,
        AssistPromptTexts.ASSIST_PROMPT_VERSION,
        AssistPromptTexts.ASSIST_PROMPT_V2);
    return loadPrompt();
  }

  private Map<String, Object> loadPrompt() {
    return jdbc
        .query(
            "SELECT id, version, system_text FROM ai_prompts WHERE id = ?",
            (rs, i) -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("_id", rs.getString("id"));
              m.put("version", rs.getInt("version"));
              m.put("system", rs.getString("system_text"));
              return m;
            },
            AssistPromptTexts.ASSIST_PROMPT_ID)
        .stream()
        .findFirst()
        .orElseGet(
            () -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("_id", AssistPromptTexts.ASSIST_PROMPT_ID);
              m.put("version", AssistPromptTexts.ASSIST_PROMPT_VERSION);
              m.put("system", AssistPromptTexts.ASSIST_PROMPT_V2);
              return m;
            });
  }

  @Transactional
  public Map<String, Object> ensureCapabilities() {
    Integer ver =
        jdbc.query(
            "SELECT version FROM ai_capabilities WHERE id = ?",
            rs -> rs.next() ? rs.getInt(1) : null,
            CapabilityCatalog.CAPABILITY_ID);
    if (ver != null && ver >= CapabilityCatalog.CAPABILITY_VERSION) {
      return loadCapabilities();
    }
    try {
      String apisJson = objectMapper.writeValueAsString(CapabilityCatalog.seedApis());
      jdbc.update(
          """
          INSERT INTO ai_capabilities (id, version, apis_json, updated_at)
          VALUES (?, ?, CAST(? AS jsonb), now())
          ON CONFLICT (id) DO UPDATE SET
            version = EXCLUDED.version,
            apis_json = EXCLUDED.apis_json,
            updated_at = now()
          """,
          CapabilityCatalog.CAPABILITY_ID,
          CapabilityCatalog.CAPABILITY_VERSION,
          apisJson);
    } catch (Exception e) {
      throw new IllegalStateException("capabilities seed failed", e);
    }
    return loadCapabilities();
  }

  private Map<String, Object> loadCapabilities() {
    return jdbc
        .query(
            "SELECT id, version, apis_json::text FROM ai_capabilities WHERE id = ?",
            (rs, i) -> {
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("_id", rs.getString("id"));
              m.put("version", rs.getInt("version"));
              try {
                List<Map<String, Object>> apis =
                    objectMapper.readValue(rs.getString("apis_json"), new TypeReference<>() {});
                m.put("apis", apis);
              } catch (Exception e) {
                m.put("apis", CapabilityCatalog.seedApis());
              }
              return m;
            },
            CapabilityCatalog.CAPABILITY_ID)
        .stream()
        .findFirst()
        .orElseGet(CapabilityCatalog::seedDocument);
  }
}
