package com.homestocker.modules.admin.infra;

import com.homestocker.common.TimeJson;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 数据看板只读查询。
 *
 * <p>仅 {@code SELECT}，不写任何表；口径全部集中在本类，避免各处各算一套数字。
 * 不返回 openid，家庭 id 对外只给截断值。
 */
@Repository
public class AdminDashboardRepository {

  /** 与家庭表「活跃 / 沉默」判定保持一致的窗口。 */
  public static final Duration ACTIVE_WINDOW = Duration.ofDays(7);

  private final JdbcTemplate jdbc;

  public AdminDashboardRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Map<String, Long> overview() {
    return jdbc.queryForObject(
        """
        WITH fam AS (
          SELECT f.id,
                 (SELECT count(*) FROM items i WHERE i.family_id = f.id)          AS item_cnt,
                 (SELECT max(a.created_at) FROM activities a WHERE a.family_id = f.id) AS last_act
          FROM families f
        )
        SELECT (SELECT count(*) FROM users)                                     AS users,
               (SELECT count(*) FROM users WHERE current_family_id IS NOT NULL) AS in_family,
               (SELECT count(*) FROM users
                 WHERE updated_at > now() - interval '7 days')                  AS active_7d,
               (SELECT count(*) FROM fam)                                       AS families,
               (SELECT count(*) FROM fam
                 WHERE item_cnt > 0 AND last_act > now() - interval '7 days')   AS active_families,
               (SELECT count(*) FROM fam
                 WHERE item_cnt > 0
                   AND (last_act IS NULL OR last_act <= now() - interval '7 days')) AS silent_families,
               (SELECT count(*) FROM fam WHERE item_cnt = 0)                    AS empty_families,
               (SELECT count(*) FROM items)                                     AS items,
               (SELECT count(*) FROM (
                  SELECT openid FROM memberships GROUP BY openid HAVING count(*) >= 2
                ) m)                                                            AS multi_family_users,
               (SELECT count(*) FROM items
                 WHERE expire_date IS NOT NULL
                   AND expire_date >= (now() AT TIME ZONE 'Asia/Shanghai')::date
                   AND expire_date <= (now() AT TIME ZONE 'Asia/Shanghai')::date + 7) AS expiring_soon,
               (SELECT count(DISTINCT item_id) FROM item_expire_subs)           AS subscribed_items
        """,
        (rs, rowNum) -> {
          Map<String, Long> m = new LinkedHashMap<>();
          m.put("users", rs.getLong("users"));
          m.put("inFamily", rs.getLong("in_family"));
          m.put("active7d", rs.getLong("active_7d"));
          m.put("families", rs.getLong("families"));
          m.put("activeFamilies", rs.getLong("active_families"));
          m.put("silentFamilies", rs.getLong("silent_families"));
          m.put("emptyFamilies", rs.getLong("empty_families"));
          m.put("items", rs.getLong("items"));
          m.put("multiFamilyUsers", rs.getLong("multi_family_users"));
          m.put("expiringSoon", rs.getLong("expiring_soon"));
          m.put("subscribedItems", rs.getLong("subscribed_items"));
          return m;
        });
  }

  public List<Map<String, Object>> families() {
    return jdbc.query(
        """
        SELECT f.id,
               f.name,
               f.member_count,
               f.item_count,
               f.created_at,
               (SELECT max(a.created_at) FROM activities a WHERE a.family_id = f.id) AS last_activity
        FROM families f
        ORDER BY f.item_count DESC, f.created_at ASC
        """,
        (rs, rowNum) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("id", shortId(rs.getString("id")));
          m.put("name", rs.getString("name"));
          m.put("members", rs.getInt("member_count"));
          m.put("items", rs.getInt("item_count"));
          m.put("created", TimeJson.toEpochMs(rs.getTimestamp("created_at")));
          m.put("lastActivity", TimeJson.toEpochMs(rs.getTimestamp("last_activity")));
          return m;
        });
  }

  /**
   * 近 N 天每日计数（北京时间自然日，缺失日由 generate_series 补 0）。
   *
   * <p>注意：users 表没有 created_at，无法统计「每日新增注册」；新成员按 memberships.joined_at 计。
   * 活跃用户按 activities.actor_openid 去重，代表「当天真的动过台账的人数」。
   */
  public List<Map<String, Object>> dailyTrend(int days) {
    int span = Math.max(1, Math.min(days, 90));
    return jdbc.query(
        """
        WITH d AS (
          SELECT generate_series(
                   (now() AT TIME ZONE 'Asia/Shanghai')::date - (?::int - 1),
                   (now() AT TIME ZONE 'Asia/Shanghai')::date,
                   interval '1 day')::date AS day
        )
        SELECT to_char(d.day, 'MM-DD') AS label,
               (SELECT count(*) FROM items i
                 WHERE (i.created_at AT TIME ZONE 'Asia/Shanghai')::date = d.day)      AS new_items,
               (SELECT count(*) FROM memberships m
                 WHERE (m.joined_at AT TIME ZONE 'Asia/Shanghai')::date = d.day)       AS new_members,
               (SELECT count(DISTINCT a.actor_openid) FROM activities a
                 WHERE (a.created_at AT TIME ZONE 'Asia/Shanghai')::date = d.day)      AS active_users
        FROM d
        ORDER BY d.day
        """,
        (rs, rowNum) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("label", rs.getString("label"));
          m.put("items", rs.getInt("new_items"));
          m.put("members", rs.getInt("new_members"));
          m.put("activeUsers", rs.getInt("active_users"));
          return m;
        },
        span);
  }

  private static String shortId(String id) {
    if (id == null) {
      return "";
    }
    return id.length() <= 8 ? id : id.substring(0, 8);
  }
}
