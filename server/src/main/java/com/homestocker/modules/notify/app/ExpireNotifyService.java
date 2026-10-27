package com.homestocker.modules.notify.app;

import com.homestocker.common.ShanghaiDates;
import com.homestocker.config.HomestockerProperties;
import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.wechat.SubscribeSendResult;
import com.homestocker.infra.wechat.WeChatClient;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ExpireNotifyService {

  private static final Logger log = LoggerFactory.getLogger(ExpireNotifyService.class);

  /**
   * 补发窗口：错过家庭设定分钟（如恰逢重启/多实例抖动）在 2 小时内仍补发；
   * 下限不跨午夜，23 点档的服务异常不会在次日凌晨补推。
   */
  private static final int GRACE_MINUTES = 120;

  private final JdbcTemplate jdbc;
  private final FamilyRepository familyRepository;
  private final ItemRepository itemRepository;
  private final StructureRepository structureRepository;
  private final WeChatClient weChatClient;
  private final HomestockerProperties properties;

  public ExpireNotifyService(
      JdbcTemplate jdbc,
      FamilyRepository familyRepository,
      ItemRepository itemRepository,
      StructureRepository structureRepository,
      WeChatClient weChatClient,
      HomestockerProperties properties) {
    this.jdbc = jdbc;
    this.familyRepository = familyRepository;
    this.itemRepository = itemRepository;
    this.structureRepository = structureRepository;
    this.weChatClient = weChatClient;
    this.properties = properties;
  }

  /**
   * 手动触发（{@code notify.expire/run}）：不按家庭设定时间过滤、不写当天占位，
   * 便于联调时反复跑；发送成功仍会消费对应订阅。
   */
  public Map<String, Object> run() {
    String today = ShanghaiDates.todayYmd();
    List<FamilySchedule> families =
        jdbc.query(
            """
            SELECT id, expire_reminder_days FROM families
            WHERE expire_reminder_enabled = TRUE LIMIT 200
            """,
            (rs, i) -> new FamilySchedule(rs.getString(1), rs.getInt(2)));
    Stats stats = new Stats();
    for (FamilySchedule family : families) {
      notifyFamily(family, today, stats);
    }
    Map<String, Object> out = stats.toMap(today, families.size());
    log.info("[expireNotify] manual done {}", out);
    return out;
  }

  /**
   * 定时入口：只跑「设定发送时间已到（含 2 小时补发窗口）且当天未发送」的家庭。
   *
   * <p>发送前先原子占位 {@code expire_notify_last_date}，多实例并发时只有抢到的实例会发。
   */
  public Map<String, Object> runScheduled() {
    String today = ShanghaiDates.todayYmd();
    LocalTime now = LocalTime.now(ShanghaiDates.SHANGHAI);
    int nowMinutes = now.getHour() * 60 + now.getMinute();
    List<FamilySchedule> due =
        jdbc.query(
            """
            SELECT id, expire_reminder_days
              FROM families
             WHERE expire_reminder_enabled = TRUE
               AND (expire_reminder_hour * 60 + expire_reminder_minute) BETWEEN ? AND ?
               AND (expire_notify_last_date IS NULL OR expire_notify_last_date < CAST(? AS date))
             LIMIT 200
            """,
            (rs, i) -> new FamilySchedule(rs.getString(1), rs.getInt(2)),
            nowMinutes - GRACE_MINUTES,
            nowMinutes,
            today);

    Stats stats = new Stats();
    int claimed = 0;
    for (FamilySchedule family : due) {
      if (!familyRepository.claimExpireNotify(family.id(), today)) {
        continue;
      }
      claimed++;
      notifyFamily(family, today, stats);
    }
    Map<String, Object> out = stats.toMap(today, claimed);
    out.put("dueCount", due.size());
    // 每分钟一次，无命中时不打 info，避免 1440 行/天的噪音
    if (claimed > 0 || stats.failCount > 0) {
      log.info(
          "[expireNotify] scheduled now={} due={} claimed={} candidates={} sent={} dryRun={} fail={}",
          now,
          due.size(),
          claimed,
          stats.candidateCount,
          stats.sentCount,
          stats.dryRunCount,
          stats.failCount);
      if (stats.failCount > 0 && !stats.lastError.isBlank()) {
        log.warn("[expireNotify] last error: {}", stats.lastError);
      }
    } else {
      log.debug("[expireNotify] scheduled now={} nothing due", now);
    }
    return out;
  }

  /** 单个家庭：按该家配置的「提前天数」算出目标日期，再逐条订阅发送。 */
  private void notifyFamily(FamilySchedule family, String today, Stats stats) {
    String targetDate = ShanghaiDates.addDaysYmd(today, family.days());
    stats.dates.add(targetDate);
    String tmplId = properties.getExpireNotify().getTmplId();
    List<ItemRow> items = findCandidates(family.id(), targetDate);
    stats.candidateCount += items.size();
    List<String> granted =
        jdbc.query(
            """
            SELECT openid FROM memberships
            WHERE family_id = ? AND subscribe_expire_granted_at IS NOT NULL
            """,
            (rs, i) -> rs.getString(1),
            family.id());
    var grantSet = new java.util.HashSet<>(granted);

    for (ItemRow item : items) {
      List<String> subs =
          jdbc.query(
              "SELECT openid FROM item_expire_subs WHERE item_id = ?",
              (rs, i) -> rs.getString(1),
              item.id());
      for (String openid : subs) {
        if (!grantSet.contains(openid)) {
          continue;
        }
        stats.sendAttempts++;
        SubscribeSendResult result = sendOne(openid, item, tmplId);
        if (result.status() == SubscribeSendResult.Status.SENT) {
          stats.sentCount++;
          itemRepository.removeExpireSub(item.id(), openid);
        } else if (result.status() == SubscribeSendResult.Status.DRY_RUN) {
          stats.dryRunCount++;
          // do not consume subs on dry-run
        } else {
          stats.failCount++;
          if (result.error() != null && !result.error().isBlank()) {
            stats.lastError = result.error();
          }
        }
      }
    }
  }

  private List<ItemRow> findCandidates(String familyId, String targetDate) {
    return itemRepository.listByExpireDate(familyId, targetDate);
  }

  private SubscribeSendResult sendOne(String openid, ItemRow item, String tmplId) {
    String spaceName = "—";
    String locationName = "—";
    if (item.spaceId() != null) {
      spaceName =
          structureRepository
              .spaceNames(item.familyId(), List.of(item.spaceId()))
              .getOrDefault(item.spaceId(), "—");
      if (spaceName.isBlank()) {
        spaceName = "—";
      }
    }
    if (item.locationId() != null) {
      locationName =
          structureRepository
              .locationNames(item.familyId(), List.of(item.locationId()))
              .getOrDefault(item.locationId(), "—");
      if (locationName.isBlank()) {
        locationName = "—";
      }
    }
    Map<String, Object> data = new LinkedHashMap<>();
    data.put("thing1", Map.of("value", slice(item.name(), 20)));
    data.put(
        "date3",
        Map.of("value", item.expireDate() == null ? "" : item.expireDate().toString()));
    data.put("short_thing8", Map.of("value", slice(spaceName, 5)));
    data.put("thing9", Map.of("value", slice(locationName, 20)));
    data.put(
        "thing10",
        Map.of(
            "value",
            slice(
                item.note() == null || item.note().isBlank() ? "请留意保质期" : item.note(),
                20)));
    String page = "packageBrowse/items/detail?id=" + item.id();
    return weChatClient.sendSubscribeMessage(openid, tmplId, page, data);
  }

  private static String slice(String value, int max) {
    String s = value == null || value.isBlank() ? "—" : value.trim();
    if (s.isEmpty()) {
      s = "—";
    }
    return s.length() <= max ? s : s.substring(0, max);
  }

  private record FamilySchedule(String id, int days) {}

  private static final class Stats {
    private final TreeSet<String> dates = new TreeSet<>();
    private int candidateCount;
    private int sendAttempts;
    private int sentCount;
    private int dryRunCount;
    private int failCount;
    private String lastError = "";

    private Map<String, Object> toMap(String today, int familyCount) {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("today", today);
      out.put("dates", List.copyOf(dates));
      out.put("familyCount", familyCount);
      out.put("candidateCount", candidateCount);
      out.put("sendAttempts", sendAttempts);
      out.put("sentCount", sentCount);
      out.put("dryRunCount", dryRunCount);
      out.put("failCount", failCount);
      if (!lastError.isBlank()) {
        out.put("lastError", lastError);
      }
      return out;
    }
  }
}
