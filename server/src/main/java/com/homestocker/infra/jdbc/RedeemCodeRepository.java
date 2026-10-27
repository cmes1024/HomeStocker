package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RedeemCodeRepository {

  public record RedeemCodeRow(
      String codeHash, String product, int days, String planId, String status, boolean hostedModel) {}

  /** 运营查询行：带上核销家庭与兑换人昵称，便于看「发出去的码被谁用了」。 */
  public record AdminRedeemRow(
      String codeHash,
      String product,
      int days,
      String planId,
      String status,
      boolean hostedModel,
      Timestamp createdAt,
      Timestamp usedAt,
      String usedByFamilyId,
      String familyName,
      String usedByOpenid,
      String nickname,
      String note,
      String codeMask) {}

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
      String note,
      String codeMask) {
    jdbc.update(
        """
        INSERT INTO redeem_codes (
          code_hash, product, days, plan_id, status, created_at, note, hosted_model, code_mask
        ) VALUES (?, ?, ?, ?, 'unused', now(), ?, ?, ?)
        """,
        codeHash,
        product,
        days,
        planId,
        note == null ? "" : note,
        hostedModel,
        codeMask == null ? "" : codeMask);
  }

  /**
   * 运营只读列表：{@code status} 为空串表示全部；按发放时间倒序。
   *
   * <p>库里只有 code_hash（明文发完即弃），故不返回码本身。
   */
  public List<AdminRedeemRow> listForAdmin(String status, int limit) {
    String filter = status == null ? "" : status;
    return jdbc.query(
        """
        SELECT r.code_hash, r.product, r.days, r.plan_id, r.status, r.hosted_model,
               r.created_at, r.used_at, r.used_by_family_id, r.note, r.code_mask,
               f.name AS family_name, r.used_by_openid, u.nickname
        FROM redeem_codes r
        LEFT JOIN families f ON f.id = r.used_by_family_id
        LEFT JOIN users u ON u.openid = r.used_by_openid
        WHERE (? = '' OR r.status = ?)
        ORDER BY r.created_at DESC, r.code_hash
        LIMIT ?
        """,
        (rs, i) ->
            new AdminRedeemRow(
                rs.getString("code_hash"),
                rs.getString("product"),
                rs.getInt("days"),
                rs.getString("plan_id"),
                rs.getString("status"),
                rs.getBoolean("hosted_model"),
                rs.getTimestamp("created_at"),
                rs.getTimestamp("used_at"),
                rs.getString("used_by_family_id"),
                rs.getString("family_name"),
                rs.getString("used_by_openid"),
                rs.getString("nickname"),
                rs.getString("note"),
                rs.getString("code_mask")),
        filter,
        filter,
        limit);
  }

  /** 全表按状态计数；键为 unused / used / revoked。 */
  public Map<String, Long> countByStatus() {
    Map<String, Long> out = new HashMap<>();
    jdbc.query(
        "SELECT status, count(*) AS n FROM redeem_codes GROUP BY status",
        rs -> {
          out.put(rs.getString("status"), rs.getLong("n"));
        });
    return out;
  }

  /** 自 {@code since} 起核销的张数（按 used_at）。 */
  public long countUsedSince(Timestamp since) {
    Long n =
        jdbc.queryForObject(
            "SELECT count(*) FROM redeem_codes WHERE status = 'used' AND used_at >= ?",
            Long.class,
            since);
    return n == null ? 0L : n;
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
