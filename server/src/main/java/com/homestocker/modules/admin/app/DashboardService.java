package com.homestocker.modules.admin.app;

import com.homestocker.modules.admin.infra.AdminDashboardRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** 后台数据看板聚合。只读，不参与任何业务写路径。 */
@Service
public class DashboardService {

  private final AdminDashboardRepository repository;

  public DashboardService(AdminDashboardRepository repository) {
    this.repository = repository;
  }

  public Map<String, Object> overview() {
    Map<String, Long> c = repository.overview();
    long users = c.getOrDefault("users", 0L);
    long inFamily = c.getOrDefault("inFamily", 0L);
    long families = c.getOrDefault("families", 0L);
    long activeFamilies = c.getOrDefault("activeFamilies", 0L);
    long silentFamilies = c.getOrDefault("silentFamilies", 0L);
    long emptyFamilies = c.getOrDefault("emptyFamilies", 0L);

    Map<String, Object> ov = new LinkedHashMap<>();
    ov.put("users", users);
    ov.put("inFamily", inFamily);
    ov.put("noFamily", Math.max(0, users - inFamily));
    ov.put("active7d", c.getOrDefault("active7d", 0L));
    ov.put("families", families);
    ov.put("activeFamilies", activeFamilies);
    ov.put("silentFamilies", silentFamilies);
    ov.put("emptyFamilies", emptyFamilies);
    ov.put("items", c.getOrDefault("items", 0L));
    ov.put("multiFamilyUsers", c.getOrDefault("multiFamilyUsers", 0L));
    ov.put("expiringSoon", c.getOrDefault("expiringSoon", 0L));
    ov.put("subscribedItems", c.getOrDefault("subscribedItems", 0L));

    Map<String, Object> health = new LinkedHashMap<>();
    health.put("active", activeFamilies);
    health.put("silent", silentFamilies);
    health.put("empty", emptyFamilies);
    health.put("subscribedItems", c.getOrDefault("subscribedItems", 0L));

    List<Map<String, Object>> familyRows = repository.families();
    long now = System.currentTimeMillis();
    long windowMs = AdminDashboardRepository.ACTIVE_WINDOW.toMillis();
    for (Map<String, Object> f : familyRows) {
      int items = f.get("items") instanceof Number n ? n.intValue() : 0;
      Long last = f.get("lastActivity") instanceof Long l ? l : null;
      String status;
      if (items <= 0) {
        status = "empty";
      } else if (last != null && now - last <= windowMs) {
        status = "active";
      } else {
        status = "silent";
      }
      f.put("status", status);
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("overview", ov);
    out.put("health", health);
    out.put("families", familyRows);
    out.put("trend", repository.dailyTrend(30));
    out.put(
        "notes",
        List.of(
            "「活跃家庭」= 有物资且近 7 天有台账操作；「沉默家庭」= 有物资但 7 天没动；「空壳家庭」= 0 物资。",
            "users 表没有 created_at，注册趋势无法统计；趋势里的「新成员」按 memberships.joined_at 计。",
            "趋势里的「活跃用户」按 activities.actor_openid 去重，只反映当天有台账操作的人，不含仅打开小程序的人。",
            "全表只读 SELECT；不返回 openid，家庭 id 只给前 8 位。"));
    out.put("generatedAt", now);
    return out;
  }
}
