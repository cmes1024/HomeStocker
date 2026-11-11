package com.homestocker.infra.jdbc;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** 平台级分享奖励配置（单行表 invite_settings）。 */
@Repository
public class InviteSettingsRepository {

  public record Row(boolean enabled, int rewardDays, int maxActivations) {}

  private static final RowMapper<Row> ROW =
      (rs, i) ->
          new Row(
              rs.getBoolean("enabled"),
              rs.getInt("reward_days"),
              rs.getInt("max_activations"));

  private final JdbcTemplate jdbc;

  public InviteSettingsRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<Row> find() {
    return jdbc
        .query(
            "SELECT enabled, reward_days, max_activations FROM invite_settings WHERE id = TRUE",
            ROW)
        .stream()
        .findFirst();
  }

  public void upsert(boolean enabled, int rewardDays, int maxActivations, String openid) {
    jdbc.update(
        """
        INSERT INTO invite_settings (id, enabled, reward_days, max_activations, updated_at, updated_by)
        VALUES (TRUE, ?, ?, ?, now(), ?)
        ON CONFLICT (id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          reward_days = EXCLUDED.reward_days,
          max_activations = EXCLUDED.max_activations,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
        """,
        enabled,
        rewardDays,
        maxActivations,
        openid);
  }
}
