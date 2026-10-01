package com.homestocker.modules.notify.app;

import com.homestocker.common.ShanghaiDates;
import com.homestocker.config.HomestockerProperties;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.wechat.SubscribeSendResult;
import com.homestocker.infra.wechat.WeChatClient;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ExpireNotifyService {

  private static final Logger log = LoggerFactory.getLogger(ExpireNotifyService.class);

  private final JdbcTemplate jdbc;
  private final ItemRepository itemRepository;
  private final StructureRepository structureRepository;
  private final WeChatClient weChatClient;
  private final HomestockerProperties properties;

  public ExpireNotifyService(
      JdbcTemplate jdbc,
      ItemRepository itemRepository,
      StructureRepository structureRepository,
      WeChatClient weChatClient,
      HomestockerProperties properties) {
    this.jdbc = jdbc;
    this.itemRepository = itemRepository;
    this.structureRepository = structureRepository;
    this.weChatClient = weChatClient;
    this.properties = properties;
  }

  public Map<String, Object> run() {
    String today = ShanghaiDates.todayYmd();
    List<String> dates =
        List.of(today, ShanghaiDates.addDaysYmd(today, 1), ShanghaiDates.addDaysYmd(today, 3));
    String tmplId = properties.getExpireNotify().getTmplId();
    log.info("[expireNotify] start today={} dates={} tmplId={}", today, dates, tmplId);

    List<String> familyIds =
        jdbc.query(
            "SELECT id FROM families WHERE expire_reminder_enabled = TRUE LIMIT 200",
            (rs, i) -> rs.getString(1));

    int candidateCount = 0;
    int sendAttempts = 0;
    int sentCount = 0;
    int dryRunCount = 0;
    int failCount = 0;
    String lastError = "";

    for (String familyId : familyIds) {
      List<ItemRow> items = findCandidates(familyId, dates);
      candidateCount += items.size();
      List<String> granted =
          jdbc.query(
              """
              SELECT openid FROM memberships
              WHERE family_id = ? AND subscribe_expire_granted_at IS NOT NULL
              """,
              (rs, i) -> rs.getString(1),
              familyId);
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
          sendAttempts++;
          SubscribeSendResult result = sendOne(openid, item, tmplId);
          if (result.status() == SubscribeSendResult.Status.SENT) {
            sentCount++;
            itemRepository.removeExpireSub(item.id(), openid);
          } else if (result.status() == SubscribeSendResult.Status.DRY_RUN) {
            dryRunCount++;
            // do not consume subs on dry-run
          } else {
            failCount++;
            if (result.error() != null && !result.error().isBlank()) {
              lastError = result.error();
            }
          }
        }
      }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("today", today);
    out.put("dates", dates);
    out.put("familyCount", familyIds.size());
    out.put("candidateCount", candidateCount);
    out.put("sendAttempts", sendAttempts);
    out.put("sentCount", sentCount);
    out.put("dryRunCount", dryRunCount);
    out.put("failCount", failCount);
    if (!lastError.isBlank()) {
      out.put("lastError", lastError);
    }
    log.info("[expireNotify] done {}", out);
    return out;
  }

  private List<ItemRow> findCandidates(String familyId, List<String> dates) {
    String end = ShanghaiDates.addDaysYmd(ShanghaiDates.todayYmd(), 3);
    List<ItemRow> all = itemRepository.listExpiring(familyId, end, 100);
    var set = new java.util.HashSet<>(dates);
    List<ItemRow> out = new ArrayList<>();
    for (ItemRow item : all) {
      if (item.expireDate() != null && set.contains(item.expireDate().toString())) {
        out.add(item);
      }
    }
    return out;
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
}
