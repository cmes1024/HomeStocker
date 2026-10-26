package com.homestocker.infra.jdbc;

import com.homestocker.common.ShanghaiDates;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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

  /** 「快过期」窗口（天），与到期提醒 / 首页临期横幅一致 */
  private static final int EXPIRE_SOON_WINDOW_DAYS = 3;

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

  /** 标签有无筛选：ANY=不限，UNTAGGED=一件没挂，TAGGED=至少挂一件。 */
  public enum TagFilter {
    ANY,
    UNTAGGED,
    TAGGED
  }

  public List<ItemRow> list(String familyId, String spaceId, String tagId, int limit) {
    return query(familyId, spaceId, tagId, null, null, TagFilter.ANY, limit);
  }

  public List<ItemRow> list(
      String familyId, String spaceId, String tagId, BigDecimal maxQuantity, int limit) {
    return query(familyId, spaceId, tagId, maxQuantity, null, TagFilter.ANY, limit);
  }

  /** 只列没挂任何标签的行（tagged=untagged）。 */
  public List<ItemRow> listUntagged(
      String familyId, String spaceId, BigDecimal maxQuantity, int limit) {
    return query(familyId, spaceId, null, maxQuantity, null, TagFilter.UNTAGGED, limit);
  }

  /** 只列至少挂了一个标签的行（tagged=tagged）。 */
  public List<ItemRow> listTagged(
      String familyId, String spaceId, BigDecimal maxQuantity, int limit) {
    return query(familyId, spaceId, null, maxQuantity, null, TagFilter.TAGGED, limit);
  }

  /** 没挂任何标签 + 名称关键字（OR）下推。 */
  public List<ItemRow> searchAnyUntagged(
      String familyId,
      String spaceId,
      BigDecimal maxQuantity,
      List<String> keywords,
      int limit) {
    return query(familyId, spaceId, null, maxQuantity, keywords, TagFilter.UNTAGGED, limit);
  }

  /** 至少挂一个标签 + 名称关键字（OR）下推。 */
  public List<ItemRow> searchAnyTagged(
      String familyId,
      String spaceId,
      BigDecimal maxQuantity,
      List<String> keywords,
      int limit) {
    return query(familyId, spaceId, null, maxQuantity, keywords, TagFilter.TAGGED, limit);
  }

  /**
   * 按名称模糊搜索。关键字过滤下推到数据库后再 LIMIT：先在内存里取 100 行再过滤，
   * 家庭超过 100 件时会把新加的物资整批漏掉（管家「有没有牛奶」查不到）。
   */
  public List<ItemRow> search(
      String familyId, String spaceId, String tagId, String keyword, int limit) {
    return query(
        familyId,
        spaceId,
        tagId,
        null,
        keyword == null ? List.of() : List.of(keyword),
        TagFilter.ANY,
        limit);
  }

  /** 多个名称关键字（OR）下推，管家 probe 一次问「牛奶」「鸡蛋」时用。 */
  public List<ItemRow> searchAny(
      String familyId,
      String spaceId,
      String tagId,
      BigDecimal maxQuantity,
      List<String> keywords,
      int limit) {
    return query(familyId, spaceId, tagId, maxQuantity, keywords, TagFilter.ANY, limit);
  }

  /** LIKE 模式串：转义用户输入里的 % / _ / \，按字面量匹配（ESCAPE '\'）。 */
  static String likePattern(String keyword) {
    String k = keyword == null ? "" : keyword.trim();
    return "%" + k.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
  }

  private List<ItemRow> query(
      String familyId,
      String spaceId,
      String tagId,
      BigDecimal maxQuantity,
      List<String> keywords,
      TagFilter tagFilter,
      int limit) {
    String today = ShanghaiDates.todayYmd();
    String soonEnd = ShanghaiDates.addDaysYmd(today, EXPIRE_SOON_WINDOW_DAYS);
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
    if (tagFilter == TagFilter.UNTAGGED) {
      sql.append(
          " AND NOT EXISTS (SELECT 1 FROM item_tags ut WHERE ut.item_id = i.id)");
    } else if (tagFilter == TagFilter.TAGGED) {
      sql.append(" AND EXISTS (SELECT 1 FROM item_tags tt WHERE tt.item_id = i.id)");
    }
    if (maxQuantity != null) {
      sql.append(" AND i.quantity <= ?");
      args.add(maxQuantity);
    }
    if (keywords != null && !keywords.isEmpty()) {
      List<String> clean = new ArrayList<>();
      for (String k : keywords) {
        if (k != null && !k.isBlank()) {
          clean.add(k);
        }
      }
      if (!clean.isEmpty()) {
        sql.append(" AND (");
        for (int i = 0; i < clean.size(); i++) {
          if (i > 0) {
            sql.append(" OR ");
          }
          sql.append("i.name ILIKE ? ESCAPE '\\'");
          args.add(likePattern(clean.get(i)));
        }
        sql.append(")");
      }
    }
    // 排序：已过期(0) > 快过期(1) > 其余(2)；组内按添加时间正序，id 兜底保证稳定
    // 注意：ORDER BY 行刻意多缩进一个空格。文本块起始换行会被编译器删除，少了这个空格，
    // 动态条件末尾的 "?" 会直接粘成 "?ORDER BY"（pgjdbc 报 trailing junk after parameter
    // $2ORDER，home 接口 500）。改这段前先读这条注释，勿删这个空格。
    sql.append(
        """
         ORDER BY
          CASE
            WHEN i.expire_date IS NULL THEN 2
            WHEN i.expire_date < CAST(? AS date) THEN 0
            WHEN i.expire_date <= CAST(? AS date) THEN 1
            ELSE 2
          END,
          i.created_at ASC,
          i.id ASC
        LIMIT ?
        """);
    args.add(today);
    args.add(soonEnd);
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

  /** 一件标签都没挂的台账行数。 */
  public int countUntagged(String familyId) {
    Integer n =
        jdbc.queryForObject(
            """
            SELECT COUNT(1) FROM items i
            WHERE i.family_id = ?
              AND NOT EXISTS (SELECT 1 FROM item_tags ut WHERE ut.item_id = i.id)
            """,
            Integer.class,
            familyId);
    return n == null ? 0 : n;
  }

  public int countByFamily(String familyId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(1) FROM items WHERE family_id = ?", Integer.class, familyId);
    return n == null ? 0 : n;
  }

  /** space_id → count；未分组空间 id 也可能为空串，调用方用树解析名。 */
  public List<Map<String, Object>> countBySpace(String familyId) {
    return jdbc.query(
        """
        SELECT COALESCE(space_id, '') AS space_id, COUNT(1) AS cnt
        FROM items
        WHERE family_id = ?
        GROUP BY COALESCE(space_id, '')
        ORDER BY cnt DESC
        """,
        (rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("spaceId", rs.getString("space_id"));
          m.put("count", rs.getInt("cnt"));
          return m;
        },
        familyId);
  }

  public List<Map<String, Object>> countByTag(String familyId) {
    return jdbc.query(
        """
        SELECT t.name AS tag_name, COUNT(DISTINCT it.item_id) AS cnt
        FROM item_tags it
        JOIN tags t ON t.id = it.tag_id AND t.family_id = ?
        JOIN items i ON i.id = it.item_id AND i.family_id = ?
        GROUP BY t.name
        ORDER BY cnt DESC, t.name ASC
        """,
        (rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("tagName", rs.getString("tag_name"));
          m.put("count", rs.getInt("cnt"));
          return m;
        },
        familyId,
        familyId);
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

  /** Distinct item names in the family, for name-overlap recall. */
  public List<String> listNames(String familyId) {
    return jdbc.query(
        """
        SELECT DISTINCT name FROM items
        WHERE family_id = ? AND name IS NOT NULL AND btrim(name) <> ''
        """,
        (rs, i) -> rs.getString(1),
        familyId);
  }

  /** Exact name across the family (for unit inheritance / collide awareness). */
  public List<ItemRow> findByFamilyAndExactName(String familyId, String name, int limit) {
    int lim = Math.min(Math.max(limit, 1), 40);
    return hydrateAll(
        jdbc.query(
            """
            SELECT * FROM items
            WHERE family_id = ? AND name = ?
            ORDER BY updated_at DESC LIMIT ?
            """,
            BASE_ROW,
            familyId,
            name,
            lim));
  }
}
