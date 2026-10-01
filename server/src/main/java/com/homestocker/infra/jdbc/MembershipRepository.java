package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class MembershipRepository {

  private static final RowMapper<MembershipRow> ROW =
      (rs, i) ->
          new MembershipRow(
              rs.getString("openid"), rs.getString("family_id"), rs.getTimestamp("joined_at"));

  private final JdbcTemplate jdbc;

  public MembershipRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public boolean exists(String openid, String familyId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM memberships WHERE openid = ? AND family_id = ?",
            Integer.class,
            openid,
            familyId);
    return count != null && count > 0;
  }

  public void insert(String openid, String familyId, Timestamp joinedAt) {
    jdbc.update(
        """
        INSERT INTO memberships (openid, family_id, joined_at, subscribe_expire_granted_at)
        VALUES (?, ?, ?, NULL)
        """,
        openid,
        familyId,
        joinedAt);
  }

  public void delete(String openid, String familyId) {
    jdbc.update("DELETE FROM memberships WHERE openid = ? AND family_id = ?", openid, familyId);
  }

  public void deleteByFamily(String familyId) {
    jdbc.update("DELETE FROM memberships WHERE family_id = ?", familyId);
  }

  public int countByOpenid(String openid) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM memberships WHERE openid = ?", Integer.class, openid);
    return n == null ? 0 : n;
  }

  public List<MembershipRow> listByOpenid(String openid) {
    return jdbc.query(
        "SELECT openid, family_id, joined_at FROM memberships WHERE openid = ? ORDER BY joined_at",
        ROW,
        openid);
  }

  public List<MembershipRow> listByFamilyId(String familyId, int limit) {
    return jdbc.query(
        """
        SELECT openid, family_id, joined_at FROM memberships
        WHERE family_id = ? ORDER BY joined_at LIMIT ?
        """,
        ROW,
        familyId,
        limit);
  }

  public Optional<String> pickOtherFamilyId(String openid, String excludeFamilyId) {
    var list =
        jdbc.query(
            """
            SELECT family_id FROM memberships
            WHERE openid = ? AND family_id <> ? LIMIT 1
            """,
            (rs, i) -> rs.getString(1),
            openid,
            excludeFamilyId);
    return list.stream().findFirst();
  }

  public void recordSubscribeExpire(String openid, String familyId, Timestamp at) {
    jdbc.update(
        """
        UPDATE memberships SET subscribe_expire_granted_at = ?
        WHERE openid = ? AND family_id = ?
        """,
        at,
        openid,
        familyId);
  }
}
