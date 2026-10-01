package com.homestocker.infra.jdbc;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ItemRepository {

  private static final RowMapper<ItemRow> BASE_ROW =
      (rs, i) ->
          new ItemRow(
              rs.getString("id"),
              rs.getString("family_id"),
              rs.getString("name"),
              rs.getBigDecimal("quantity"),
              rs.getString("unit"),
              rs.getString("note"),
              rs.getString("space_id"),
              rs.getString("location_id"),
              rs.getDate("production_date"),
              rs.getDate("expire_date"),
              rs.getString("created_by"),
              rs.getString("source"),
              rs.getTimestamp("created_at"),
              rs.getTimestamp("updated_at"),
              List.of(),
              List.of());

  private final JdbcTemplate jdbc;

  public ItemRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<ItemRow> findById(String id) {
    var list = jdbc.query("SELECT * FROM items WHERE id = ?", BASE_ROW, id);
    return list.stream().findFirst().map(this::hydrate);
  }

  public List<ItemRow> findByIds(List<String> ids) {
    if (ids == null || ids.isEmpty()) {
      return List.of();
    }
    String ph = String.join(",", ids.stream().map(x -> "?").toList());
    var list =
        jdbc.query("SELECT * FROM items WHERE id IN (" + ph + ")", BASE_ROW, ids.toArray());
    return hydrateAll(list);
  }

  public List<ItemRow> list(
      String familyId, String spaceId, String tagId, int limit) {
    StringBuilder sql =
        new StringBuilder(
            """
            SELECT i.* FROM items i
            WHERE i.family_id = ?
            """);
    List<Object> args = new ArrayList<>();
    args.add(familyId);
    if (spaceId != null && !spaceId.isBlank()) {
      sql.append(" AND i.space_id = ?");
      args.add(spaceId);
    }
    if (tagId != null && !tagId.isBlank()) {
      sql.append(
          " AND EXISTS (SELECT 1 FROM item_tags t WHERE t.item_id = i.id AND t.tag_id = ?)");
      args.add(tagId);
    }
    sql.append(" ORDER BY i.updated_at DESC LIMIT ?");
    args.add(limit);
    return hydrateAll(jdbc.query(sql.toString(), BASE_ROW, args.toArray()));
  }

  public List<ItemRow> listExpiring(String familyId, String windowEndYmd, int limit) {
    return hydrateAll(
        jdbc.query(
            """
            SELECT * FROM items
            WHERE family_id = ? AND expire_date IS NOT NULL AND expire_date <= CAST(? AS date)
            ORDER BY expire_date ASC
            LIMIT ?
            """,
            BASE_ROW,
            familyId,
            windowEndYmd,
            limit));
  }

  public int countByFamily(String familyId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM items WHERE family_id = ?", Integer.class, familyId);
    return n == null ? 0 : n;
  }

  public int countExpiring(String familyId, String windowEndYmd) {
    Integer n =
        jdbc.queryForObject(
            """
            SELECT COUNT(1) FROM items
            WHERE family_id = ? AND expire_date IS NOT NULL AND expire_date <= CAST(? AS date)
            """,
            Integer.class,
            familyId,
            windowEndYmd);
    return n == null ? 0 : n;
  }

  public void insert(
      String id,
      String familyId,
      String name,
      BigDecimal quantity,
      String unit,
      String note,
      String spaceId,
      String locationId,
      Date productionDate,
      Date expireDate,
      String createdBy,
      String source,
      Timestamp now) {
    jdbc.update(
        """
        INSERT INTO items (
          id, family_id, name, quantity, unit, note, space_id, location_id,
          production_date, expire_date, created_by, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        id,
        familyId,
        name,
        quantity,
        unit,
        note,
        spaceId,
        locationId,
        productionDate,
        expireDate,
        createdBy,
        source,
        now,
        now);
  }

  public void update(
      String id,
      String name,
      BigDecimal quantity,
      String unit,
      String note,
      String spaceId,
      String locationId,
      Date productionDate,
      Date expireDate,
      String source,
      Timestamp updatedAt) {
    jdbc.update(
        """
        UPDATE items SET
          name = ?, quantity = ?, unit = ?, note = ?, space_id = ?, location_id = ?,
          production_date = ?, expire_date = ?, source = ?, updated_at = ?
        WHERE id = ?
        """,
        name,
        quantity,
        unit,
        note,
        spaceId,
        locationId,
        productionDate,
        expireDate,
        source,
        updatedAt,
        id);
  }

  public void delete(String id) {
    jdbc.update("DELETE FROM items WHERE id = ?", id);
  }

  public void replaceTags(String itemId, List<String> tagIds) {
    jdbc.update("DELETE FROM item_tags WHERE item_id = ?", itemId);
    if (tagIds == null) {
      return;
    }
    for (String tagId : tagIds) {
      jdbc.update("INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)", itemId, tagId);
    }
  }

  public void replaceImages(String itemId, List<String> objectKeys) {
    jdbc.update("DELETE FROM item_images WHERE item_id = ?", itemId);
    if (objectKeys == null) {
      return;
    }
    for (int i = 0; i < objectKeys.size(); i++) {
      jdbc.update(
          """
          INSERT INTO item_images (id, item_id, sort_order, object_key, created_at)
          VALUES (gen_random_uuid()::text, ?, ?, ?, now())
          """,
          itemId,
          i,
          objectKeys.get(i));
    }
  }

  public Set<String> subscribedItemIds(String familyId, String openid) {
    List<String> ids =
        jdbc.query(
            "SELECT item_id FROM item_expire_subs WHERE family_id = ? AND openid = ?",
            (rs, i) -> rs.getString(1),
            familyId,
            openid);
    return new HashSet<>(ids);
  }

  public boolean hasExpireSub(String itemId, String openid) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM item_expire_subs WHERE item_id = ? AND openid = ?",
            Integer.class,
            itemId,
            openid);
    return n != null && n > 0;
  }

  public void upsertExpireSub(String familyId, String itemId, String openid) {
    jdbc.update(
        """
        INSERT INTO item_expire_subs (item_id, openid, family_id, created_at)
        VALUES (?, ?, ?, now())
        ON CONFLICT (item_id, openid) DO NOTHING
        """,
        itemId,
        openid,
        familyId);
  }

  public void removeExpireSub(String itemId, String openid) {
    jdbc.update(
        "DELETE FROM item_expire_subs WHERE item_id = ? AND openid = ?", itemId, openid);
  }

  public void removeExpireSubsForItem(String itemId) {
    jdbc.update("DELETE FROM item_expire_subs WHERE item_id = ?", itemId);
  }

  public boolean anyExpireSub(String itemId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM item_expire_subs WHERE item_id = ?", Integer.class, itemId);
    return n != null && n > 0;
  }

  public int countTagsInFamily(String familyId, List<String> tagIds) {
    if (tagIds == null || tagIds.isEmpty()) {
      return 0;
    }
    String ph = String.join(",", tagIds.stream().map(x -> "?").toList());
    List<Object> args = new ArrayList<>();
    args.add(familyId);
    args.addAll(tagIds);
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM tags WHERE family_id = ? AND id IN (" + ph + ")",
            Integer.class,
            args.toArray());
    return n == null ? 0 : n;
  }

  private ItemRow hydrate(ItemRow base) {
    return hydrateAll(List.of(base)).get(0);
  }

  private List<ItemRow> hydrateAll(List<ItemRow> bases) {
    if (bases.isEmpty()) {
      return bases;
    }
    List<String> ids = bases.stream().map(ItemRow::id).toList();
    String ph = String.join(",", ids.stream().map(x -> "?").toList());
    Map<String, List<String>> tags = new HashMap<>();
    jdbc.query(
        "SELECT item_id, tag_id FROM item_tags WHERE item_id IN (" + ph + ")",
        rs -> {
          tags.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2));
        },
        ids.toArray());
    Map<String, List<String>> images = new HashMap<>();
    jdbc.query(
        """
        SELECT item_id, object_key FROM item_images
        WHERE item_id IN ("""
            + ph
            + ") ORDER BY sort_order ASC",
        rs -> {
          images.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2));
        },
        ids.toArray());
    List<ItemRow> out = new ArrayList<>(bases.size());
    for (ItemRow b : bases) {
      out.add(
          new ItemRow(
              b.id(),
              b.familyId(),
              b.name(),
              b.quantity(),
              b.unit(),
              b.note(),
              b.spaceId(),
              b.locationId(),
              b.productionDate(),
              b.expireDate(),
              b.createdBy(),
              b.source(),
              b.createdAt(),
              b.updatedAt(),
              tags.getOrDefault(b.id(), List.of()),
              images.getOrDefault(b.id(), List.of())));
    }
    return out;
  }

  /** Same-name rows in one place (duplicate hint after create). */
  public List<ItemRow> findDuplicates(
      String familyId, String spaceId, String locationId, String name) {
    if (locationId != null && !locationId.isBlank()) {
      return hydrateAll(
          jdbc.query(
              """
              SELECT * FROM items
              WHERE family_id = ? AND space_id = ? AND location_id = ? AND name = ?
              ORDER BY updated_at DESC LIMIT 10
              """,
              BASE_ROW,
              familyId,
              spaceId,
              locationId,
              name));
    }
    return hydrateAll(
        jdbc.query(
            """
            SELECT * FROM items
            WHERE family_id = ? AND space_id = ? AND location_id IS NULL AND name = ?
            ORDER BY updated_at DESC LIMIT 10
            """,
            BASE_ROW,
            familyId,
            spaceId,
            name));
  }
}
