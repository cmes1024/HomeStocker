package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class InviteActivationRepository {

  public record ActivationRow(
      String inviteeOpenid,
      String token,
      String inviterOpenid,
      String rewardFamilyId,
      String status,
      Integer days,
      String skipReason,
      Timestamp createdAt) {}

  /** 时间窗内已发放的次数与天数。 */
  public record Stats(int count, int days) {}

  private static final RowMapper<ActivationRow> ROW =
      (rs, i) ->
          new ActivationRow(
              rs.getString("invitee_openid"),
              rs.getString("token"),
              rs.getString("inviter_openid"),
              rs.getString("reward_family_id"),
              rs.getString("status"),
              (Integer) rs.getObject("days"),
              rs.getString("skip_reason"),
              rs.getTimestamp("created_at"));

  private final JdbcTemplate jdbc;

  public InviteActivationRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** 首次建家写路径内调用；一个 openid 只能有一条记录。 */
  public int insertPending(
      String inviteeOpenid,
      String token,
      String inviterOpenid,
      String rewardFamilyId) {
    return jdbc.update(
        """
        INSERT INTO invite_activations (
          invitee_openid, token, inviter_openid, reward_family_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', now(), now())
        ON CONFLICT (invitee_openid) DO NOTHING
        """,
        inviteeOpenid,
        token,
        inviterOpenid,
        rewardFamilyId);
  }

  /** 首页兜底用：只判断有没有待消费的 pending，不加锁。 */
  public boolean hasPending(String inviteeOpenid) {
    return jdbc
        .query(
            "SELECT 1 FROM invite_activations WHERE invitee_openid = ? AND status = 'pending'",
            (rs, i) -> 1,
            inviteeOpenid)
        .stream()
        .findFirst()
        .isPresent();
  }

  /** 事务内锁行，防同一新人并发重复领奖。 */
  public Optional<ActivationRow> lockPending(String inviteeOpenid) {
    return jdbc
        .query(
            "SELECT * FROM invite_activations WHERE invitee_openid = ? AND status = 'pending' FOR UPDATE",
            ROW,
            inviteeOpenid)
        .stream()
        .findFirst();
  }

  public void markGranted(String inviteeOpenid, int days) {
    jdbc.update(
        """
        UPDATE invite_activations
        SET status = 'granted', days = ?, skip_reason = NULL, updated_at = now()
        WHERE invitee_openid = ? AND status = 'pending'
        """,
        days,
        inviteeOpenid);
  }

  public void markSkipped(String inviteeOpenid, String reason) {
    jdbc.update(
        """
        UPDATE invite_activations
        SET status = 'skipped', skip_reason = ?, updated_at = now()
        WHERE invitee_openid = ? AND status = 'pending'
        """,
        reason,
        inviteeOpenid);
  }

  public Stats grantedStats(String inviterOpenid, Timestamp since) {
    return jdbc.queryForObject(
        """
        SELECT COUNT(1), COALESCE(SUM(days), 0)
        FROM invite_activations
        WHERE inviter_openid = ? AND status = 'granted' AND created_at >= ?
        """,
        (rs, i) -> new Stats(rs.getInt(1), rs.getInt(2)),
        inviterOpenid,
        since);
  }
}
