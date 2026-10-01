package com.homestocker.infra.jdbc;

import com.homestocker.common.TimeJson;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Minimal space/tag/tree access for family seed + dissolve + tree rebuild. */
@Repository
public class StructureRepository {

  public record SpaceLite(
      String id, String name, boolean isDefault, Timestamp createdAt) {}

  public record LocationLite(String id, String spaceId, String name, Timestamp createdAt) {}

  public record TagLite(String id, String name, Timestamp createdAt) {}

  private final JdbcTemplate jdbc;

  public StructureRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public int countSpaces(String familyId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM spaces WHERE family_id = ?", Integer.class, familyId);
    return n == null ? 0 : n;
  }

  public int countTags(String familyId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM tags WHERE family_id = ?", Integer.class, familyId);
    return n == null ? 0 : n;
  }

  public void insertDefaultSpace(String id, String familyId, Timestamp now) {
    jdbc.update(
        """
        INSERT INTO spaces (
          id, family_id, name, floor_id, is_default, cover_key, image_key, created_at, updated_at
        ) VALUES (?, ?, '仓库', NULL, TRUE, 'default-indoor', '', ?, ?)
        """,
        id,
        familyId,
        now,
        now);
  }

  public void insertDefaultTag(String id, String familyId, String name, Timestamp now) {
    jdbc.update(
        """
        INSERT INTO tags (id, family_id, name, is_default, created_at, updated_at)
        VALUES (?, ?, ?, TRUE, ?, ?)
        """,
        id,
        familyId,
        name,
        now,
        now);
  }

  public List<SpaceLite> listSpaces(String familyId) {
    return jdbc.query(
        """
        SELECT id, name, is_default, created_at FROM spaces
        WHERE family_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 100
        """,
        (rs, i) ->
            new SpaceLite(
                rs.getString("id"),
                rs.getString("name"),
                rs.getBoolean("is_default"),
                rs.getTimestamp("created_at")),
        familyId);
  }

  public List<LocationLite> listLocations(String familyId) {
    return jdbc.query(
        """
        SELECT id, space_id, name, created_at FROM locations
        WHERE family_id = ? ORDER BY created_at ASC LIMIT 200
        """,
        (rs, i) ->
            new LocationLite(
                rs.getString("id"),
                rs.getString("space_id"),
                rs.getString("name"),
                rs.getTimestamp("created_at")),
        familyId);
  }

  public List<TagLite> listTags(String familyId) {
    return jdbc.query(
        """
        SELECT id, name, created_at FROM tags
        WHERE family_id = ? ORDER BY created_at ASC LIMIT 100
        """,
        (rs, i) ->
            new TagLite(rs.getString("id"), rs.getString("name"), rs.getTimestamp("created_at")),
        familyId);
  }

  public Optional<String> findFamilyTreeJson(String familyId) {
    var list =
        jdbc.query(
            "SELECT tree_json::text FROM family_trees WHERE family_id = ?",
            (rs, i) -> rs.getString(1),
            familyId);
    return list.stream().findFirst();
  }

  public void upsertFamilyTree(String familyId, long rev, String treeJson) {
    jdbc.update(
        """
        INSERT INTO family_trees (family_id, rev, tree_json, updated_at)
        VALUES (?, ?, CAST(? AS jsonb), now())
        ON CONFLICT (family_id) DO UPDATE SET
          rev = EXCLUDED.rev,
          tree_json = EXCLUDED.tree_json,
          updated_at = now()
        """,
        familyId,
        rev,
        treeJson);
  }

  public void deleteFamilyTree(String familyId) {
    jdbc.update("DELETE FROM family_trees WHERE family_id = ?", familyId);
  }

  /** Hard-delete all family-scoped domain rows (owner dissolve). Order respects FKs. */
  public void dissolveFamilyData(String familyId) {
    jdbc.update("DELETE FROM item_expire_subs WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM item_images WHERE item_id IN (SELECT id FROM items WHERE family_id = ?)", familyId);
    jdbc.update("DELETE FROM item_tags WHERE item_id IN (SELECT id FROM items WHERE family_id = ?)", familyId);
    jdbc.update("DELETE FROM items WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM activities WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM locations WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM spaces WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM tags WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM family_ai_keys WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM family_subscriptions WHERE family_id = ?", familyId);
    jdbc.update("DELETE FROM family_trees WHERE family_id = ?", familyId);
  }

  public void deleteExpireSubsForMember(String familyId, String openid) {
    jdbc.update(
        "DELETE FROM item_expire_subs WHERE family_id = ? AND openid = ?", familyId, openid);
  }

  public Optional<SpaceLite> findSpace(String familyId, String spaceId) {
    var list =
        jdbc.query(
            """
            SELECT id, name, is_default, created_at FROM spaces
            WHERE family_id = ? AND id = ?
            """,
            (rs, i) ->
                new SpaceLite(
                    rs.getString("id"),
                    rs.getString("name"),
                    rs.getBoolean("is_default"),
                    rs.getTimestamp("created_at")),
            familyId,
            spaceId);
    return list.stream().findFirst();
  }

  public Optional<LocationLite> findLocation(String familyId, String spaceId, String locationId) {
    var list =
        jdbc.query(
            """
            SELECT id, space_id, name, created_at FROM locations
            WHERE family_id = ? AND space_id = ? AND id = ?
            """,
            (rs, i) ->
                new LocationLite(
                    rs.getString("id"),
                    rs.getString("space_id"),
                    rs.getString("name"),
                    rs.getTimestamp("created_at")),
            familyId,
            spaceId,
            locationId);
    return list.stream().findFirst();
  }

  public List<LocationLite> listLocationsBySpace(String familyId, String spaceId) {
    return jdbc.query(
        """
        SELECT id, space_id, name, created_at FROM locations
        WHERE family_id = ? AND space_id = ? ORDER BY created_at ASC LIMIT 200
        """,
        (rs, i) ->
            new LocationLite(
                rs.getString("id"),
                rs.getString("space_id"),
                rs.getString("name"),
                rs.getTimestamp("created_at")),
        familyId,
        spaceId);
  }

  public Map<String, String> spaceNames(String familyId, List<String> spaceIds) {
    Map<String, String> out = new LinkedHashMap<>();
    if (spaceIds == null || spaceIds.isEmpty()) {
      return out;
    }
    String ph = String.join(",", spaceIds.stream().map(x -> "?").toList());
    List<Object> args = new ArrayList<>();
    args.add(familyId);
    args.addAll(spaceIds);
    jdbc.query(
        "SELECT id, name FROM spaces WHERE family_id = ? AND id IN (" + ph + ")",
        (org.springframework.jdbc.core.RowCallbackHandler)
            rs -> out.put(rs.getString(1), rs.getString(2) == null ? "" : rs.getString(2)),
        args.toArray());
    return out;
  }

  public Map<String, String> locationNames(String familyId, List<String> locationIds) {
    Map<String, String> out = new LinkedHashMap<>();
    if (locationIds == null || locationIds.isEmpty()) {
      return out;
    }
    String ph = String.join(",", locationIds.stream().map(x -> "?").toList());
    List<Object> args = new ArrayList<>();
    args.add(familyId);
    args.addAll(locationIds);
    jdbc.query(
        "SELECT id, name FROM locations WHERE family_id = ? AND id IN (" + ph + ")",
        (org.springframework.jdbc.core.RowCallbackHandler)
            rs -> out.put(rs.getString(1), rs.getString(2) == null ? "" : rs.getString(2)),
        args.toArray());
    return out;
  }

  public List<String> tagNames(String familyId, List<String> tagIds) {
    if (tagIds == null || tagIds.isEmpty()) {
      return List.of();
    }
    Map<String, String> byId = new LinkedHashMap<>();
    String ph = String.join(",", tagIds.stream().map(x -> "?").toList());
    List<Object> args = new ArrayList<>();
    args.add(familyId);
    args.addAll(tagIds);
    jdbc.query(
        "SELECT id, name FROM tags WHERE family_id = ? AND id IN (" + ph + ")",
        (org.springframework.jdbc.core.RowCallbackHandler)
            rs -> byId.put(rs.getString(1), rs.getString(2) == null ? "" : rs.getString(2)),
        args.toArray());
    List<String> names = new ArrayList<>();
    for (String id : tagIds) {
      if (byId.containsKey(id)) {
        names.add(byId.get(id));
      }
    }
    return names;
  }

  /** Ensure default warehouse exists; return its id. */
  public String ensureDefaultSpaceId(String familyId) {
    var spaces = listSpaces(familyId);
    if (!spaces.isEmpty()) {
      return spaces.stream()
          .filter(SpaceLite::isDefault)
          .findFirst()
          .orElse(spaces.get(0))
          .id();
    }
    String id = java.util.UUID.randomUUID().toString();
    insertDefaultSpace(id, familyId, TimeJson.nowTs());
    return id;
  }

  public record SpaceRow(
      String id,
      String familyId,
      String name,
      String floorId,
      boolean isDefault,
      String coverKey,
      String imageKey,
      Timestamp createdAt,
      Timestamp updatedAt) {}

  public record LocationRow(
      String id,
      String familyId,
      String spaceId,
      String name,
      String imageKey,
      Timestamp createdAt,
      Timestamp updatedAt) {}

  public record TagRow(
      String id,
      String familyId,
      String name,
      boolean isDefault,
      Timestamp createdAt,
      Timestamp updatedAt) {}

  private static final org.springframework.jdbc.core.RowMapper<SpaceRow> SPACE_ROW =
      (rs, i) ->
          new SpaceRow(
              rs.getString("id"),
              rs.getString("family_id"),
              rs.getString("name"),
              rs.getString("floor_id"),
              rs.getBoolean("is_default"),
              rs.getString("cover_key"),
              rs.getString("image_key"),
              rs.getTimestamp("created_at"),
              rs.getTimestamp("updated_at"));

  private static final org.springframework.jdbc.core.RowMapper<LocationRow> LOC_ROW =
      (rs, i) ->
          new LocationRow(
              rs.getString("id"),
              rs.getString("family_id"),
              rs.getString("space_id"),
              rs.getString("name"),
              rs.getString("image_key"),
              rs.getTimestamp("created_at"),
              rs.getTimestamp("updated_at"));

  private static final org.springframework.jdbc.core.RowMapper<TagRow> TAG_ROW =
      (rs, i) ->
          new TagRow(
              rs.getString("id"),
              rs.getString("family_id"),
              rs.getString("name"),
              rs.getBoolean("is_default"),
              rs.getTimestamp("created_at"),
              rs.getTimestamp("updated_at"));

  public Optional<SpaceRow> findSpaceRow(String familyId, String spaceId) {
    var list =
        jdbc.query(
            "SELECT * FROM spaces WHERE family_id = ? AND id = ?", SPACE_ROW, familyId, spaceId);
    return list.stream().findFirst();
  }

  public Optional<SpaceRow> findSpaceRowById(String spaceId) {
    var list = jdbc.query("SELECT * FROM spaces WHERE id = ?", SPACE_ROW, spaceId);
    return list.stream().findFirst();
  }

  public List<SpaceRow> listSpaceRows(String familyId) {
    return jdbc.query(
        """
        SELECT * FROM spaces WHERE family_id = ?
        ORDER BY is_default DESC, created_at ASC LIMIT 100
        """,
        SPACE_ROW,
        familyId);
  }

  public void insertSpace(
      String id,
      String familyId,
      String name,
      String floorId,
      boolean isDefault,
      String coverKey,
      String imageKey,
      Timestamp now) {
    jdbc.update(
        """
        INSERT INTO spaces (
          id, family_id, name, floor_id, is_default, cover_key, image_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        familyId,
        name,
        floorId,
        isDefault,
        coverKey == null ? "default-indoor" : coverKey,
        imageKey == null ? "" : imageKey,
        now,
        now);
  }

  public void updateSpace(
      String id, String name, String coverKey, String imageKey, Timestamp updatedAt) {
    jdbc.update(
        """
        UPDATE spaces SET name = ?, cover_key = ?, image_key = ?, updated_at = ?
        WHERE id = ?
        """,
        name,
        coverKey,
        imageKey == null ? "" : imageKey,
        updatedAt,
        id);
  }

  public void deleteSpace(String id) {
    jdbc.update("DELETE FROM spaces WHERE id = ?", id);
  }

  public void deleteLocationsBySpace(String spaceId) {
    jdbc.update("DELETE FROM locations WHERE space_id = ?", spaceId);
  }

  public void migrateItemsSpace(String fromSpaceId, String toSpaceId) {
    jdbc.update(
        """
        UPDATE items SET space_id = ?, location_id = NULL, updated_at = now()
        WHERE space_id = ?
        """,
        toSpaceId,
        fromSpaceId);
  }

  public void backfillOrphanItems(String familyId, String spaceId) {
    jdbc.update(
        """
        UPDATE items SET space_id = ?, updated_at = now()
        WHERE family_id = ? AND (space_id IS NULL OR space_id = '')
        """,
        spaceId,
        familyId);
  }

  public Optional<LocationRow> findLocationRow(String locationId) {
    var list = jdbc.query("SELECT * FROM locations WHERE id = ?", LOC_ROW, locationId);
    return list.stream().findFirst();
  }

  public List<LocationRow> listLocationRowsBySpace(String familyId, String spaceId) {
    return jdbc.query(
        """
        SELECT * FROM locations WHERE family_id = ? AND space_id = ?
        ORDER BY created_at ASC LIMIT 100
        """,
        LOC_ROW,
        familyId,
        spaceId);
  }

  public void insertLocation(
      String id,
      String familyId,
      String spaceId,
      String name,
      String imageKey,
      Timestamp now) {
    jdbc.update(
        """
        INSERT INTO locations (
          id, family_id, space_id, name, image_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        familyId,
        spaceId,
        name,
        imageKey == null ? "" : imageKey,
        now,
        now);
  }

  public void updateLocation(String id, String name, String imageKey, Timestamp updatedAt) {
    jdbc.update(
        """
        UPDATE locations SET name = ?, image_key = ?, updated_at = ?
        WHERE id = ?
        """,
        name,
        imageKey == null ? "" : imageKey,
        updatedAt,
        id);
  }

  public void deleteLocation(String id) {
    jdbc.update("DELETE FROM locations WHERE id = ?", id);
  }

  public void clearItemsLocation(String locationId) {
    jdbc.update(
        "UPDATE items SET location_id = NULL, updated_at = now() WHERE location_id = ?",
        locationId);
  }

  public Optional<TagRow> findTagRow(String familyId, String tagId) {
    var list =
        jdbc.query("SELECT * FROM tags WHERE family_id = ? AND id = ?", TAG_ROW, familyId, tagId);
    return list.stream().findFirst();
  }

  public Optional<TagRow> findTagRowById(String tagId) {
    var list = jdbc.query("SELECT * FROM tags WHERE id = ?", TAG_ROW, tagId);
    return list.stream().findFirst();
  }

  public List<TagRow> listTagRows(String familyId) {
    return jdbc.query(
        """
        SELECT * FROM tags WHERE family_id = ?
        ORDER BY created_at ASC LIMIT 100
        """,
        TAG_ROW,
        familyId);
  }

  public boolean tagNameExists(String familyId, String name, String excludeId) {
    Integer n;
    if (excludeId == null) {
      n =
          jdbc.queryForObject(
              "SELECT COUNT(1) FROM tags WHERE family_id = ? AND name = ?",
              Integer.class,
              familyId,
              name);
    } else {
      n =
          jdbc.queryForObject(
              "SELECT COUNT(1) FROM tags WHERE family_id = ? AND name = ? AND id <> ?",
              Integer.class,
              familyId,
              name,
              excludeId);
    }
    return n != null && n > 0;
  }

  public void insertTag(
      String id, String familyId, String name, boolean isDefault, Timestamp now) {
    jdbc.update(
        """
        INSERT INTO tags (id, family_id, name, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        id,
        familyId,
        name,
        isDefault,
        now,
        now);
  }

  public void updateTag(String id, String name, Timestamp updatedAt) {
    jdbc.update("UPDATE tags SET name = ?, updated_at = ? WHERE id = ?", name, updatedAt, id);
  }

  public void deleteTag(String id) {
    jdbc.update("DELETE FROM tags WHERE id = ?", id);
  }

  public void stripTagFromItems(String tagId) {
    jdbc.update("DELETE FROM item_tags WHERE tag_id = ?", tagId);
  }
}
