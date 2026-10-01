package com.homestocker.infra.jdbc;

import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

  private final JdbcTemplate jdbc;

  public UserRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<UserRow> findByOpenid(String openid) {
    var list =
        jdbc.query(
            """
            SELECT openid, current_family_id, nickname, avatar_url
            FROM users
            WHERE openid = ?
            """,
            (rs, rowNum) ->
                new UserRow(
                    rs.getString("openid"),
                    rs.getString("current_family_id"),
                    rs.getString("nickname"),
                    rs.getString("avatar_url")),
            openid);
    return list.stream().findFirst();
  }

  public Optional<String> findCurrentFamilyId(String openid) {
    return findByOpenid(openid).map(UserRow::currentFamilyId);
  }

  /** Insert new user on first login; touch updated_at on repeat. Never wipe profile fields. */
  public UserRow upsertOnLogin(String openid) {
    jdbc.update(
        """
        INSERT INTO users (openid, current_family_id, nickname, avatar_url, updated_at)
        VALUES (?, NULL, '', '', now())
        ON CONFLICT (openid) DO UPDATE SET updated_at = now()
        """,
        openid);
    return findByOpenid(openid)
        .orElseThrow(() -> new IllegalStateException("user upsert failed: " + openid));
  }

  public UserRow ensureUser(String openid) {
    return findByOpenid(openid).orElseGet(() -> upsertOnLogin(openid));
  }

  public void setCurrentFamily(String openid, String familyIdOrNull) {
    jdbc.update(
        "UPDATE users SET current_family_id = ?, updated_at = now() WHERE openid = ?",
        familyIdOrNull,
        openid);
  }

  public void updateProfile(String openid, String nickname, String avatarUrl) {
    jdbc.update(
        """
        UPDATE users SET nickname = ?, avatar_url = ?, updated_at = now()
        WHERE openid = ?
        """,
        nickname == null ? "" : nickname,
        avatarUrl == null ? "" : avatarUrl,
        openid);
  }

  public List<String> listOpenidsWithCurrentFamily(String familyId) {
    return jdbc.query(
        "SELECT openid FROM users WHERE current_family_id = ?",
        (rs, i) -> rs.getString(1),
        familyId);
  }

  public List<UserRow> findByOpenids(List<String> openids) {
    if (openids == null || openids.isEmpty()) {
      return List.of();
    }
    String placeholders = String.join(",", openids.stream().map(o -> "?").toList());
    return jdbc.query(
        "SELECT openid, current_family_id, nickname, avatar_url FROM users WHERE openid IN ("
            + placeholders
            + ")",
        (rs, rowNum) ->
            new UserRow(
                rs.getString("openid"),
                rs.getString("current_family_id"),
                rs.getString("nickname"),
                rs.getString("avatar_url")),
        openids.toArray());
  }
}
