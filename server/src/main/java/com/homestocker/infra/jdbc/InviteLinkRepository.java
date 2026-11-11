package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class InviteLinkRepository {

  public record LinkRow(
      String token,
      String inviterOpenid,
      String rewardFamilyId,
      String status,
      Timestamp createdAt) {}

  private static final RowMapper<LinkRow> ROW =
      (rs, i) ->
          new LinkRow(
              rs.getString("token"),
              rs.getString("inviter_openid"),
              rs.getString("reward_family_id"),
              rs.getString("status"),
              rs.getTimestamp("created_at"));

  private final JdbcTemplate jdbc;

  public InviteLinkRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<LinkRow> findByToken(String token) {
    return jdbc.query("SELECT * FROM invite_links WHERE token = ?", ROW, token).stream()
        .findFirst();
  }

  public Optional<LinkRow> findActiveByInviter(String openid) {
    return jdbc
        .query(
            "SELECT * FROM invite_links WHERE inviter_openid = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
            ROW,
            openid)
        .stream()
        .findFirst();
  }

  /** 重新生成链接时停用旧链接；累计次数与天数不重置。 */
  public int deactivateAll(String openid) {
    return jdbc.update(
        "UPDATE invite_links SET status = 'inactive' WHERE inviter_openid = ? AND status = 'active'",
        openid);
  }

  public void insert(String token, String inviterOpenid, String rewardFamilyId) {
    jdbc.update(
        """
        INSERT INTO invite_links (token, inviter_openid, reward_family_id, status, created_at)
        VALUES (?, ?, ?, 'active', now())
        """,
        token,
        inviterOpenid,
        rewardFamilyId);
  }
}
