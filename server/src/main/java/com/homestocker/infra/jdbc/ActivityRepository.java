package com.homestocker.infra.jdbc;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ActivityRepository {

  public record ActivityRow(
      String id,
      String familyId,
      String itemId,
      String action,
      String actorOpenid,
      String itemName,
      Integer batchCount,
      String spaceId,
      String spaceName,
      String locationId,
      String locationName,
      BigDecimal quantity,
      String unit,
      String changedFieldsJson,
      String summary,
      String source,
      Timestamp createdAt) {}

  private final JdbcTemplate jdbc;

  public ActivityRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void insert(
      String id,
      String familyId,
      String itemId,
      String action,
      String actorOpenid,
      String itemName,
      Integer batchCount,
      String spaceId,
      String spaceName,
      String locationId,
      String locationName,
      BigDecimal quantity,
      String unit,
      String changedFieldsJson,
      String summary,
      String source,
      Timestamp createdAt) {
    jdbc.update(
        """
        INSERT INTO activities (
          id, family_id, item_id, action, actor_openid, item_name, batch_count,
          space_id, space_name, location_id, location_name, quantity, unit,
          changed_fields, summary, source, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          CAST(? AS jsonb), ?, ?, ?
        )
        """,
        id,
        familyId,
        itemId == null ? "" : itemId,
        action,
        actorOpenid,
        itemName == null ? "" : itemName,
        batchCount,
        spaceId,
        spaceName,
        locationId,
        locationName,
        quantity,
        unit,
        changedFieldsJson,
        summary,
        source == null ? "ui" : source,
        createdAt);
  }

  public int countByFamily(String familyId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM activities WHERE family_id = ?", Integer.class, familyId);
    return n == null ? 0 : n;
  }

  public void deleteOldest(String familyId, int limit) {
    jdbc.update(
        """
        DELETE FROM activities WHERE id IN (
          SELECT id FROM activities WHERE family_id = ?
          ORDER BY created_at ASC LIMIT ?
        )
        """,
        familyId,
        limit);
  }

  public List<Map<String, Object>> listRecentForItem(String itemId, int limit) {
    return listEnriched("a.item_id = ?", List.of(itemId), 0, limit);
  }

  public List<Map<String, Object>> listByFamily(String familyId, int skip, int limit) {
    return listEnriched("a.family_id = ?", List.of(familyId), skip, limit);
  }

  /** Inclusive start, exclusive end; action empty = all actions. */
  public List<Map<String, Object>> listByFamilyBetween(
      String familyId, long startMsInclusive, long endMsExclusive, String action, int limit) {
    List<Object> args = new ArrayList<>();
    StringBuilder where = new StringBuilder("a.family_id = ? AND a.created_at >= ? AND a.created_at < ?");
    args.add(familyId);
    args.add(new Timestamp(startMsInclusive));
    args.add(new Timestamp(endMsExclusive));
    String act = action == null ? "" : action.trim().toLowerCase();
    if (!act.isEmpty() && !"all".equals(act)) {
      where.append(" AND a.action = ?");
      args.add(act);
    }
    return listEnriched(where.toString(), args, 0, limit);
  }

  public OptionalCursor latestCursor(String familyId) {
    var list =
        jdbc.query(
            """
            SELECT id, created_at FROM activities
            WHERE family_id = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (rs, i) ->
                new OptionalCursor(rs.getString("id"), rs.getTimestamp("created_at").getTime()),
            familyId);
    return list.isEmpty() ? new OptionalCursor("", 0L) : list.get(0);
  }

  public record OptionalCursor(String id, long createdAt) {}

  private List<Map<String, Object>> listEnriched(
      String whereSql, List<Object> whereArgs, int skip, int limit) {
    List<Object> args = new ArrayList<>(whereArgs);
    args.add(limit);
    args.add(Math.max(skip, 0));
    return jdbc.query(
        """
        SELECT a.id, a.item_id, a.action, a.actor_openid, a.item_name, a.batch_count,
               a.space_id, a.space_name, a.location_id, a.location_name,
               a.quantity, a.unit,
               a.changed_fields::text AS changed_fields, a.summary, a.source, a.created_at,
               COALESCE(u.nickname, '') AS actor_nickname,
               COALESCE(u.avatar_url, '') AS actor_avatar_url
        FROM activities a
        LEFT JOIN users u ON u.openid = a.actor_openid
        WHERE """
            + " "
            + whereSql
            + """
         ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
        """,
        (rs, i) -> {
          Map<String, Object> m = new java.util.LinkedHashMap<>();
          m.put("_id", rs.getString("id"));
          m.put("itemId", rs.getString("item_id"));
          m.put("action", rs.getString("action"));
          m.put("actorOpenid", rs.getString("actor_openid"));
          m.put("itemName", rs.getString("item_name"));
          m.put("batchCount", rs.getObject("batch_count"));
          m.put("spaceId", rs.getString("space_id"));
          m.put("spaceName", rs.getString("space_name"));
          m.put("locationId", rs.getString("location_id"));
          m.put("locationName", rs.getString("location_name"));
          m.put("quantity", rs.getBigDecimal("quantity"));
          m.put("unit", rs.getString("unit"));
          m.put("changedFields", rs.getString("changed_fields"));
          m.put("summary", rs.getString("summary"));
          m.put("source", rs.getString("source"));
          m.put("createdAt", rs.getTimestamp("created_at").getTime());
          m.put("actorNickname", rs.getString("actor_nickname"));
          m.put("actorAvatarUrl", rs.getString("actor_avatar_url"));
          return m;
        },
        args.toArray());
  }
}
