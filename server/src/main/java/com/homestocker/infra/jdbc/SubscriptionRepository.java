package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class SubscriptionRepository {

  private static final RowMapper<SubscriptionRow> ROW =
      (rs, i) ->
          new SubscriptionRow(
              rs.getString("family_id"),
              rs.getString("plan_id"),
              rs.getString("product"),
              rs.getString("source"),
              rs.getTimestamp("expires_at"),
              rs.getString("limits_override"));

  private final JdbcTemplate jdbc;

  public SubscriptionRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<SubscriptionRow> findByFamilyId(String familyId) {
    var list =
        jdbc.query("SELECT * FROM family_subscriptions WHERE family_id = ?", ROW, familyId);
    return list.stream().findFirst();
  }

  public void upsert(
      String familyId,
      String planId,
      String product,
      String source,
      Timestamp expiresAt,
      String lastRedeemCodeId) {
    jdbc.update(
        """
        INSERT INTO family_subscriptions (
          family_id, plan_id, product, source, expires_at, limits_override,
          last_redeem_code_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, now(), now())
        ON CONFLICT (family_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          product = EXCLUDED.product,
          source = EXCLUDED.source,
          expires_at = EXCLUDED.expires_at,
          last_redeem_code_id = EXCLUDED.last_redeem_code_id,
          updated_at = now()
        """,
        familyId,
        planId,
        product,
        source,
        expiresAt,
        lastRedeemCodeId);
  }

  public void delete(String familyId) {
    jdbc.update("DELETE FROM family_subscriptions WHERE family_id = ?", familyId);
  }
}
