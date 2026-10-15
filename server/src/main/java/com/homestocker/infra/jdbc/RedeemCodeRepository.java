package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RedeemCodeRepository {

  public record RedeemCodeRow(
      String codeHash, String product, int days, String planId, String status, boolean hostedModel) {}

  private final JdbcTemplate jdbc;

  public RedeemCodeRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<RedeemCodeRow> findByHash(String codeHash) {
    var list =
        jdbc.query(
            """
            SELECT code_hash, product, days, plan_id, status, hosted_model
            FROM redeem_codes WHERE code_hash = ?
            """,
            (rs, i) ->
                new RedeemCodeRow(
                    rs.getString("code_hash"),
                    rs.getString("product"),
                    rs.getInt("days"),
                    rs.getString("plan_id"),
                    rs.getString("status"),
                    rs.getBoolean("hosted_model")),
            codeHash);
    return list.stream().findFirst();
  }

  public void insert(
      String codeHash,
      String product,
      int days,
      String planId,
      boolean hostedModel,
      String note) {
    jdbc.update(
        """
        INSERT INTO redeem_codes (
          code_hash, product, days, plan_id, status, created_at, note, hosted_model
        ) VALUES (?, ?, ?, ?, 'unused', now(), ?, ?)
        """,
        codeHash,
        product,
        days,
        planId,
        note == null ? "" : note,
        hostedModel);
  }

  /** CAS unused → used. Returns true if this call consumed the code. */
  public boolean markUsed(String codeHash, String familyId, String openid, Timestamp usedAt) {
    int n =
        jdbc.update(
            """
            UPDATE redeem_codes
            SET status = 'used', used_by_family_id = ?, used_by_openid = ?, used_at = ?
            WHERE code_hash = ? AND status = 'unused'
            """,
            familyId,
            openid,
            usedAt,
            codeHash);
    return n == 1;
  }
}
