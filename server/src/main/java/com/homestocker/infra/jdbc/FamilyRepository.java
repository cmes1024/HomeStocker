package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class FamilyRepository {

  private static final RowMapper<FamilyRow> ROW =
      (rs, i) ->
          new FamilyRow(
              rs.getString("id"),
              rs.getString("name"),
              rs.getString("invite_code"),
              rs.getString("owner_openid"),
              rs.getInt("member_count"),
              (Integer) rs.getObject("item_count"),
              rs.getString("background_json"),
              rs.getBoolean("expire_reminder_enabled"),
              rs.getTimestamp("tags_seeded_at"),
              rs.getString("entitlement_json"),
              rs.getTimestamp("created_at"));

  private final JdbcTemplate jdbc;

  public FamilyRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<FamilyRow> findById(String id) {
    var list = jdbc.query("SELECT * FROM families WHERE id = ?", ROW, id);
    return list.stream().findFirst();
  }

  public Optional<FamilyRow> findByInviteCode(String inviteCode) {
    var list = jdbc.query("SELECT * FROM families WHERE invite_code = ?", ROW, inviteCode);
    return list.stream().findFirst();
  }

  public boolean inviteCodeExists(String inviteCode) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM families WHERE invite_code = ?", Integer.class, inviteCode);
    return n != null && n > 0;
  }

  public void insert(
      String id,
      String name,
      String inviteCode,
      String ownerOpenid,
      String backgroundJson,
      Timestamp createdAt) {
    jdbc.update(
        """
        INSERT INTO families (
          id, name, invite_code, owner_openid, member_count, item_count,
          background_json, expire_reminder_enabled, tags_seeded_at, entitlement_json, created_at
        ) VALUES (?, ?, ?, ?, 1, 0, CAST(? AS jsonb), TRUE, NULL, NULL, ?)
        """,
        id,
        name,
        inviteCode,
        ownerOpenid,
        backgroundJson,
        createdAt);
  }

  public void updateName(String id, String name) {
    jdbc.update("UPDATE families SET name = ? WHERE id = ?", name, id);
  }

  public void updateBackground(String id, String backgroundJson) {
    jdbc.update(
        "UPDATE families SET background_json = CAST(? AS jsonb) WHERE id = ?", backgroundJson, id);
  }

  public void updateExpireReminder(String id, boolean enabled) {
    jdbc.update("UPDATE families SET expire_reminder_enabled = ? WHERE id = ?", enabled, id);
  }

  public void updateTagsSeededAt(String id, Timestamp at) {
    jdbc.update("UPDATE families SET tags_seeded_at = ? WHERE id = ?", at, id);
  }

  public void updateEntitlementJson(String id, String entitlementJson) {
    jdbc.update(
        "UPDATE families SET entitlement_json = CAST(? AS jsonb) WHERE id = ?",
        entitlementJson,
        id);
  }

  public void incrementMemberCount(String id, int delta) {
    jdbc.update(
        "UPDATE families SET member_count = GREATEST(0, member_count + ?) WHERE id = ?", delta, id);
  }

  public void delete(String id) {
    jdbc.update("DELETE FROM families WHERE id = ?", id);
  }

  public int getItemCount(String id) {
    Integer n =
        jdbc.queryForObject("SELECT item_count FROM families WHERE id = ?", Integer.class, id);
    return n == null ? 0 : n;
  }

  public void bumpItemCount(String id, int delta) {
    if (delta >= 0) {
      jdbc.update("UPDATE families SET item_count = item_count + ? WHERE id = ?", delta, id);
    } else {
      jdbc.update(
          "UPDATE families SET item_count = GREATEST(0, item_count + ?) WHERE id = ?", delta, id);
    }
  }

  public void setItemCount(String id, int count) {
    jdbc.update("UPDATE families SET item_count = ? WHERE id = ?", Math.max(0, count), id);
  }

  public List<FamilyRow> findByIds(List<String> ids) {
    if (ids == null || ids.isEmpty()) {
      return List.of();
    }
    String placeholders = String.join(",", ids.stream().map(id -> "?").toList());
    return jdbc.query(
        "SELECT * FROM families WHERE id IN (" + placeholders + ")", ROW, ids.toArray());
  }
}
