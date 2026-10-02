package com.homestocker.modules.ai.tools;

import com.homestocker.common.ApiException;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.infra.jdbc.ActivityRepository;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import com.homestocker.modules.ai.agent.ActRefs;
import com.homestocker.modules.ai.agent.ItemsProbe;
import com.homestocker.modules.ai.agent.Presentation;
import com.homestocker.modules.ai.agent.TreeMatch;
import com.homestocker.modules.ai.habits.FamilyHabit;
import com.homestocker.modules.ai.habits.FamilyHabitService;
import com.homestocker.modules.ai.habits.HabitObserveService;
import com.homestocker.modules.ai.habits.HabitSlots;
import com.homestocker.modules.ai.knowledge.KnowledgePacks;
import com.homestocker.modules.ai.knowledge.KnowledgeService;
import com.homestocker.modules.ai.pages.PageRegistry;
import com.homestocker.modules.family.app.FamilyTreeService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Tool handlers port of miniprogram/cloudfunctions/ai/tools/* */
@Component
public class DomainTools {

  private final ItemsProbe itemsProbe;
  private final KnowledgeService knowledgeService;
  private final ItemRepository itemRepository;
  private final ActivityRepository activityRepository;
  private final FamilyHabitService familyHabitService;
  private final HabitObserveService habitObserveService;

  public DomainTools(
      ItemsProbe itemsProbe,
      KnowledgeService knowledgeService,
      ItemRepository itemRepository,
      ActivityRepository activityRepository,
      FamilyHabitService familyHabitService,
      HabitObserveService habitObserveService) {
    this.itemsProbe = itemsProbe;
    this.knowledgeService = knowledgeService;
    this.itemRepository = itemRepository;
    this.activityRepository = activityRepository;
    this.familyHabitService = familyHabitService;
    this.habitObserveService = habitObserveService;
  }

  public ToolResult run(String use, ToolContext ctx, Map<String, Object> call, int step) {
    return switch (use) {
      case "item.search" -> itemSearch(ctx, call, step);
      case "item.listExpiring" -> itemListExpiring(ctx, step);
      case "activity.list" -> activityList(ctx, call, step);
      case "item.stats" -> itemStats(ctx, call, step);
      case "item.create" -> itemCreate(ctx, call, step);
      case "item.createMany" -> itemCreateMany(ctx, call, step);
      case "item.update" -> itemUpdate(ctx, call, step);
      case "item.remove" -> itemRemove(ctx, call, step);
      case "item.removeMany" -> itemRemoveMany(ctx, call, step);
      case "item.merge" -> itemMerge(ctx, call, step);
      case "space.create" -> spaceCreate(ctx, call, step);
      case "space.createMany" -> spaceCreateMany(ctx, call, step);
      case "space.createLocation" -> spaceCreateLocation(ctx, call, step);
      case "space.createLocationMany" -> spaceCreateLocationMany(ctx, call, step);
      case "space.remove" -> spaceRemove(ctx, call, step);
      case "space.removeMany" -> spaceRemoveMany(ctx, call, step);
      case "space.removeLocation" -> spaceRemoveLocation(ctx, call, step);
      case "space.removeLocationMany" -> spaceRemoveLocationMany(ctx, call, step);
      case "tag.create" -> tagCreate(ctx, call, step);
      case "tag.createMany" -> tagCreateMany(ctx, call, step);
      case "tag.remove" -> tagRemove(ctx, call, step);
      case "tag.removeMany" -> tagRemoveMany(ctx, call, step);
      case "item.expireSubscribePanel" -> expireSubscribePanel(ctx, step);
      case "knowledge.get" -> knowledgeGet(ctx, call, step);
      case "page.get" -> pageGet(ctx, call, step);
      case "habit.list" -> habitList(ctx, step);
      case "habit.observe" -> habitObserve(ctx, step);
      case "habit.upsert" -> habitUpsert(ctx, call, step);
      case "habit.remove" -> habitRemove(ctx, call, step);
      default -> ToolResult.fail("第 " + step + " 步不能执行（" + use + "）").build();
    };
  }

  private ToolResult itemSearch(ToolContext ctx, Map<String, Object> call, int step) {
    Map<String, Object> space = TreeMatch.matchSpace(ctx.tree, ToolHelpers.str(call.get("spaceName")));
    Map<String, Object> loc =
        space != null ? TreeMatch.matchLocation(space, ToolHelpers.str(call.get("locationName"))) : null;
    String keyword = ToolHelpers.str(call.get("name"));
    if (keyword.isEmpty()) {
      keyword = ToolHelpers.str(call.get("keyword"));
    }
    List<String> keywords = keyword.isEmpty() ? List.of() : List.of(keyword.toLowerCase(Locale.ROOT));
    String spaceId = space != null ? ToolHelpers.str(space.get("id")) : null;
    String locationId = loc != null ? ToolHelpers.str(loc.get("id")) : null;
    String tagName = ToolHelpers.str(call.get("tagName")).trim();
    if (tagName.isEmpty()) {
      tagName = ToolHelpers.str(call.get("tag")).trim();
    }
    String tagId = null;
    if (!tagName.isEmpty()) {
      Map<String, Object> tag = TreeMatch.matchTag(ctx.tree, tagName);
      if (tag == null) {
        return ToolResult.fail("第 " + step + " 步失败：标签「" + tagName + "」不在家庭结构里").build();
      }
      tagId = ToolHelpers.str(tag.get("id"));
    }
    BigDecimal maxQuantity = null;
    if (call.get("maxQuantity") != null && !"".equals(String.valueOf(call.get("maxQuantity")))) {
      try {
        maxQuantity = new BigDecimal(String.valueOf(call.get("maxQuantity")).trim());
        if (maxQuantity.compareTo(BigDecimal.ZERO) < 0) {
          maxQuantity = BigDecimal.ZERO;
        }
      } catch (Exception e) {
        return ToolResult.fail("第 " + step + " 步失败：maxQuantity 无效").build();
      }
    }
    List<ItemRow> list =
        itemsProbe.listItemsCompact(
            ctx.familyId, spaceId, locationId, tagId, maxQuantity, keywords, 100);
    List<Map<String, Object>> capped = new ArrayList<>();
    for (ItemRow row : list) {
      capped.add(itemRowMap(row));
    }
    String prefix = "查询";
    if (maxQuantity != null) {
      prefix = "数量≤" + maxQuantity.stripTrailingZeros().toPlainString();
    } else if (!tagName.isEmpty()) {
      prefix = "标签「" + tagName + "」";
    }
    Presentation.PresentationView inv =
        Presentation.buildInventoryPresentation(capped, ctx.tree, prefix, null);
    return ToolResult.ok(inv.lead()).inventory(capped).build();
  }

  private ToolResult activityList(ToolContext ctx, Map<String, Object> call, int step) {
    LocalDate today = ShanghaiDates.todayLocalDate();
    String day = ToolHelpers.str(call.get("day")).trim().toLowerCase(Locale.ROOT);
    int days = 1;
    if (call.get("days") != null && !"".equals(String.valueOf(call.get("days")))) {
      try {
        days = Integer.parseInt(String.valueOf(call.get("days")).trim());
      } catch (NumberFormatException ignored) {
        days = 1;
      }
    }
    days = Math.min(Math.max(days, 1), 7);
    LocalDate startDay;
    LocalDate endExclusive;
    String windowLabel;
    if ("yesterday".equals(day) || "昨天".equals(day) || "昨".equals(day)) {
      startDay = today.minusDays(1);
      endExclusive = today;
      windowLabel = "昨天";
    } else if ("recent".equals(day) || "近".equals(day) || days > 1) {
      if ("recent".equals(day) || "近".equals(day)) {
        days = Math.max(days, 3);
      }
      startDay = today.minusDays(days - 1L);
      endExclusive = today.plusDays(1);
      windowLabel = "近" + days + "天";
    } else {
      startDay = today;
      endExclusive = today.plusDays(1);
      windowLabel = "今天";
    }

    String action = ToolHelpers.str(call.get("action")).trim().toLowerCase(Locale.ROOT);
    if ("all".equals(action) || "全部".equals(action)) {
      action = "";
    } else if ("add".equals(action) || "新增".equals(action) || "新建".equals(action)) {
      action = "create";
    } else if ("改".equals(action) || "修改".equals(action)) {
      action = "update";
    } else if ("删".equals(action) || "删除".equals(action)) {
      action = "remove";
    }
    if (!action.isEmpty()
        && !"create".equals(action)
        && !"update".equals(action)
        && !"remove".equals(action)) {
      return ToolResult.fail("第 " + step + " 步失败：action 仅支持 create/update/remove").build();
    }

    final int limit = 40;
    long startMs = ShanghaiDates.startOfDayEpochMs(startDay);
    long endMs = ShanghaiDates.startOfDayEpochMs(endExclusive);
    List<Map<String, Object>> raw =
        activityRepository.listByFamilyBetween(ctx.familyId, startMs, endMs, action, limit + 1);
    boolean truncated = raw.size() > limit;
    if (truncated) {
      raw = raw.subList(0, limit);
    }

    List<String> detailLines = new ArrayList<>();
    List<Map<String, Object>> inventory = new ArrayList<>();
    for (Map<String, Object> row : raw) {
      String act = ToolHelpers.str(row.get("action")).trim().toLowerCase(Locale.ROOT);
      String itemName = ToolHelpers.str(row.get("itemName")).trim();
      if (itemName.isEmpty()) {
        itemName = "未命名";
      }
      String when = ShanghaiDates.formatDateTimeMs(toLong(row.get("createdAt")));
      String place =
          TreeMatch.placeLabel(
              ToolHelpers.str(row.get("spaceName")), ToolHelpers.str(row.get("locationName")));
      String qtyBit = "";
      if (row.get("quantity") != null) {
        qtyBit = " qty=" + row.get("quantity") + ToolHelpers.str(row.get("unit"));
      }
      detailLines.add(
          (when.isEmpty() ? "?" : when)
              + " | "
              + (act.isEmpty() ? "?" : act)
              + " | "
              + itemName
              + qtyBit
              + (place.isEmpty() ? "" : " | " + place));

      String itemId = ToolHelpers.str(row.get("itemId")).trim();
      if (("create".equals(act) || "update".equals(act))
          && !itemId.isEmpty()
          && inventory.size() < 24) {
        Map<String, Object> inv = new LinkedHashMap<>();
        inv.put("_id", itemId);
        inv.put("name", itemName);
        inv.put("quantity", row.get("quantity") != null ? row.get("quantity") : 1);
        inv.put("unit", ToolHelpers.str(row.get("unit")));
        inv.put("spaceName", ToolHelpers.str(row.get("spaceName")));
        inv.put("locationName", ToolHelpers.str(row.get("locationName")));
        inv.put("note", act + (when.isEmpty() ? "" : " " + when));
        inventory.add(inv);
      }
    }

    String actionBit = action.isEmpty() ? "all" : action;
    if (raw.isEmpty()) {
      String empty =
          "activity.list window="
              + windowLabel
              + " action="
              + actionBit
              + " returned=0 truncated=false（无消息行；不是库存为空）";
      return ToolResult.ok(empty).inventory(List.of()).inventoryPrefix("家庭消息").build();
    }
    StringBuilder sb = new StringBuilder();
    sb.append("activity.list window=")
        .append(windowLabel)
        .append(" action=")
        .append(actionBit)
        .append(" returned=")
        .append(raw.size())
        .append(" truncated=")
        .append(truncated)
        .append("（明细供自行计数/去重；非库存快照）");
    for (String line : detailLines) {
      sb.append('\n').append(line);
    }
    return ToolResult.ok(sb.toString())
        .inventory(inventory)
        .inventoryPrefix("家庭消息")
        .build();
  }

  private ToolResult itemStats(ToolContext ctx, Map<String, Object> call, int step) {
    String groupBy = ToolHelpers.str(call.get("groupBy")).trim().toLowerCase(Locale.ROOT);
    if (groupBy.isEmpty() || "total".equals(groupBy) || "none".equals(groupBy)) {
      groupBy = "total";
    } else if ("spaces".equals(groupBy) || "place".equals(groupBy)) {
      groupBy = "space";
    } else if ("tags".equals(groupBy)) {
      groupBy = "tag";
    }
    if (!Set.of("total", "space", "tag").contains(groupBy)) {
      return ToolResult.fail("第 " + step + " 步失败：groupBy 仅支持 total/space/tag").build();
    }

    int total = itemRepository.countByFamily(ctx.familyId);
    List<Map<String, Object>> buckets = new ArrayList<>();
    StringBuilder sb = new StringBuilder();
    sb.append("item.stats totalItems=").append(total);

    if ("space".equals(groupBy)) {
      List<Map<String, Object>> rows = itemRepository.countBySpace(ctx.familyId);
      sb.append(" groupBy=space");
      if (rows.isEmpty()) {
        sb.append(" buckets=0");
      } else {
        for (Map<String, Object> row : rows) {
          String spaceId = ToolHelpers.str(row.get("spaceId"));
          String spaceName = spaceId;
          Map<String, Object> space = findSpaceById(ctx.tree, spaceId);
          if (space != null) {
            spaceName = ToolHelpers.str(space.get("name"));
            if (spaceName.isEmpty()) {
              spaceName = spaceId;
            }
          } else if (spaceId.isEmpty()) {
            spaceName = "未分组";
          }
          long count = toLong(row.get("count"));
          sb.append('\n').append(spaceName).append('=').append(count);
          buckets.add(Map.of("label", spaceName, "value", count));
        }
      }
    } else if ("tag".equals(groupBy)) {
      List<Map<String, Object>> rows = itemRepository.countByTag(ctx.familyId);
      sb.append(" groupBy=tag（仅统计已挂签物资；无标签物资不计入各标签）");
      if (rows.isEmpty()) {
        sb.append(" buckets=0");
      } else {
        for (Map<String, Object> row : rows) {
          String tagName = ToolHelpers.str(row.get("tagName"));
          if (tagName.isEmpty()) {
            tagName = "未命名标签";
          }
          long count = toLong(row.get("count"));
          sb.append('\n').append(tagName).append('=').append(count);
          buckets.add(Map.of("label", tagName, "value", count));
        }
      }
    } else {
      sb.append(" groupBy=total（全库台账行数，非名称去重种数）");
      buckets.add(Map.of("label", "全库", "value", (long) total));
    }
    Map<String, Object> stats = new LinkedHashMap<>();
    stats.put("totalItems", total);
    stats.put("groupBy", groupBy);
    stats.put("buckets", buckets);
    return ToolResult.ok(sb.toString()).stats(stats).build();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> findSpaceById(Map<String, Object> tree, String spaceId) {
    if (spaceId == null || spaceId.isBlank() || tree == null) {
      return null;
    }
    Object raw = tree.get("spaces");
    if (!(raw instanceof List<?> list)) {
      return null;
    }
    for (Object o : list) {
      if (o instanceof Map<?, ?> m && spaceId.equals(String.valueOf(m.get("id")))) {
        return (Map<String, Object>) m;
      }
    }
    return null;
  }

  private static long toLong(Object v) {
    if (v instanceof Number n) {
      return n.longValue();
    }
    try {
      return Long.parseLong(String.valueOf(v).trim());
    } catch (Exception e) {
      return 0L;
    }
  }

  private ToolResult itemListExpiring(ToolContext ctx, int step) {
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.itemService.listExpiring(Map.of("limit", 50)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> data = (Map<String, Object>) res.get("data");
    List<Map<String, Object>> list =
        data.get("list") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    Presentation.PresentationView inv =
        Presentation.buildInventoryPresentation(list, ctx.tree, "临期/过期", "没有临期或过期物品");
    return ToolResult.ok(inv.lead()).inventory(list != null ? list : List.of()).build();
  }

  private ToolResult itemCreate(ToolContext ctx, Map<String, Object> call, int step) {
    String name = ToolHelpers.str(call.get("name")).trim();
    if (name.isEmpty()) {
      return ToolResult.fail("第 " + step + " 步失败：缺少物品名称").build();
    }
    Map<String, Object> space = TreeMatch.matchSpace(ctx.tree, ToolHelpers.str(call.get("spaceName")));
    if (space == null) {
      return ToolResult.fail(
              "第 "
                  + step
                  + " 步失败：空间「"
                  + ToolHelpers.str(call.get("spaceName"))
                  + "」不在家庭结构里，未新建空间")
          .build();
    }
    ToolHelpers.LocationEnsure loc =
        ToolHelpers.ensureLocation(ctx, space, ToolHelpers.str(call.get("locationName")));
    if (loc.errorMessage() != null) {
      return ToolResult.fail("第 " + step + " 步失败：" + loc.errorMessage()).build();
    }
    if (call.get("quantity") != null && "0".equals(String.valueOf(call.get("quantity")))) {
      return ToolResult.fail("第 " + step + " 步：新开物资数量不能是 0").build();
    }
    ToolResult folded = foldCreateIntoExisting(ctx, space, loc, name, call, step);
    if (folded != null) {
      return folded;
    }
    TreeMatch.TagResolve tags = TreeMatch.resolveTagIds(ctx.tree, tagNames(call.get("tagNames")));
    String unit = ToolHelpers.str(call.get("unit")).trim();
    if (unit.isEmpty()) {
      unit = inferSharedUnit(ctx.familyId, name);
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("name", name);
    payload.put("quantity", call.get("quantity") != null ? call.get("quantity") : 1);
    payload.put("unit", unit.isEmpty() ? call.get("unit") : unit);
    payload.put("note", call.get("note"));
    payload.put("spaceId", space.get("id"));
    payload.put("locationId", loc.locationId());
    payload.put("tagIds", tags.tagIds());
    payload.put("expireDate", call.get("expireDate"));
    payload.put("productionDate", call.get("productionDate"));
    payload.put("source", "agent");
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.itemService.create(payload));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + name + " — " + ToolHelpers.msg(res)).build();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> data = (Map<String, Object>) res.get("data");
    String qty =
        ToolHelpers.str(call.get("quantity") != null ? call.get("quantity") : 1)
            + (unit.isEmpty() ? ToolHelpers.str(call.get("unit")) : unit);
    String place = TreeMatch.placeLabel(ToolHelpers.str(space.get("name")), loc.locationName());
    String summary =
        "已记下 "
            + name
            + (qty.isBlank() ? "" : " " + qty)
            + (place.isEmpty() ? "" : "（" + place + "）");
    return ToolResult.ok(summary)
        .wrote(true)
        .remember(ToolResult.rememberItem(ToolHelpers.str(data.get("_id")), name, "create", null, null))
        .build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult itemCreateMany(ToolContext ctx, Map<String, Object> call, int step) {
    Object rawItems = call.get("items");
    if (!(rawItems instanceof List<?> items) || items.isEmpty()) {
      return ToolResult.fail("第 " + step + " 步失败：缺少 items").build();
    }
    if (items.size() > 20) {
      return ToolResult.fail("第 " + step + " 步失败：一次最多记 20 件").build();
    }
    List<Map<String, Object>> payloads = new ArrayList<>();
    List<String> labels = new ArrayList<>();
    List<Map<String, Object>> remember = new ArrayList<>();
    List<String> foldSummaries = new ArrayList<>();
    for (int i = 0; i < items.size(); i++) {
      Object o = items.get(i);
      if (!(o instanceof Map<?, ?>)) {
        return ToolResult.fail("第 " + step + " 步失败：第 " + (i + 1) + " 件格式无效").build();
      }
      Map<String, Object> row = (Map<String, Object>) o;
      String name = ToolHelpers.str(row.get("name")).trim();
      if (name.isEmpty()) {
        return ToolResult.fail("第 " + step + " 步失败：第 " + (i + 1) + " 件缺少物品名称").build();
      }
      Map<String, Object> space = TreeMatch.matchSpace(ctx.tree, ToolHelpers.str(row.get("spaceName")));
      if (space == null) {
        return ToolResult.fail(
                "第 "
                    + step
                    + " 步失败：空间「"
                    + ToolHelpers.str(row.get("spaceName"))
                    + "」不在家庭结构里，未新建空间")
            .build();
      }
      ToolHelpers.LocationEnsure loc =
          ToolHelpers.ensureLocation(ctx, space, ToolHelpers.str(row.get("locationName")));
      if (loc.errorMessage() != null) {
        return ToolResult.fail("第 " + step + " 步失败：第 " + (i + 1) + " 件 — " + loc.errorMessage())
            .build();
      }
      if (row.get("quantity") != null && "0".equals(String.valueOf(row.get("quantity")))) {
        return ToolResult.fail("第 " + step + " 步：第 " + (i + 1) + " 件数量不能是 0").build();
      }
      ToolResult folded = foldCreateIntoExisting(ctx, space, loc, name, row, step);
      if (folded != null) {
        if (!folded.ok) {
          return folded;
        }
        foldSummaries.add(folded.summary);
        if (folded.remember instanceof Map<?, ?> rem) {
          Map<String, Object> one = new LinkedHashMap<>();
          for (Map.Entry<?, ?> e : rem.entrySet()) {
            if (e.getKey() != null) {
              one.put(String.valueOf(e.getKey()), e.getValue());
            }
          }
          remember.add(one);
        }
        continue;
      }
      TreeMatch.TagResolve tags = TreeMatch.resolveTagIds(ctx.tree, tagNames(row.get("tagNames")));
      String unit = ToolHelpers.str(row.get("unit")).trim();
      if (unit.isEmpty()) {
        unit = inferSharedUnit(ctx.familyId, name);
      }
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("name", name);
      payload.put("quantity", row.get("quantity") != null ? row.get("quantity") : 1);
      payload.put("unit", unit.isEmpty() ? row.get("unit") : unit);
      payload.put("note", row.get("note"));
      payload.put("spaceId", space.get("id"));
      payload.put("locationId", loc.locationId());
      payload.put("tagIds", tags.tagIds());
      payload.put("expireDate", row.get("expireDate"));
      payload.put("productionDate", row.get("productionDate"));
      payload.put("source", "agent");
      payloads.add(payload);
      String qty =
          ToolHelpers.str(row.get("quantity") != null ? row.get("quantity") : 1)
              + (unit.isEmpty() ? ToolHelpers.str(row.get("unit")) : unit);
      String place = TreeMatch.placeLabel(ToolHelpers.str(space.get("name")), loc.locationName());
      labels.add(name + (qty.isBlank() ? "" : " " + qty) + (place.isEmpty() ? "" : "（" + place + "）"));
    }
    if (payloads.isEmpty()) {
      String summary = foldSummaries.isEmpty() ? "" : String.join("；", foldSummaries);
      return ToolResult.ok(summary).wrote(!foldSummaries.isEmpty()).remember(remember).build();
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("items", payloads);
    body.put("source", "agent");
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.itemService.createMany(body));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    Map<String, Object> data = (Map<String, Object>) res.get("data");
    if (data != null && data.get("list") instanceof List<?> list) {
      for (Object rowObj : list) {
        if (rowObj instanceof Map<?, ?> m) {
          remember.add(
              ToolResult.rememberItem(
                  ToolHelpers.str(m.get("_id")).isEmpty()
                      ? ToolHelpers.str(m.get("id"))
                      : ToolHelpers.str(m.get("_id")),
                  ToolHelpers.str(m.get("name")),
                  "create",
                  null,
                  null));
        }
      }
    }
    List<String> allLabels = new ArrayList<>(foldSummaries);
    String preview =
        labels.size() <= 8
            ? String.join("、", labels)
            : String.join("、", labels.subList(0, 8)) + "等 " + labels.size() + " 件";
    allLabels.add("已记下 " + preview);
    return ToolResult.ok(String.join("；", allLabels)).wrote(true).remember(remember).build();
  }

  private ToolResult itemUpdate(ToolContext ctx, Map<String, Object> call, int step) {
    Map<String, Object> row = ActRefs.lookupRef(call, ctx.refs);
    if (row == null) {
      return ToolResult.fail("没法确定要改哪一件，请再说一下物品名称和现在在哪").build();
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("itemId", row.get("itemId"));
    payload.put("source", "agent");
    if (call.containsKey("name")) payload.put("name", call.get("name"));
    if (call.containsKey("quantity")) {
      if ("0".equals(String.valueOf(call.get("quantity")))) {
        return ToolResult.fail("第 " + step + " 步：数量须大于 0").build();
      }
      payload.put("quantity", call.get("quantity"));
    }
    if (call.containsKey("unit")) payload.put("unit", call.get("unit"));
    if (call.containsKey("note")) payload.put("note", call.get("note"));
    if (call.containsKey("expireDate")) payload.put("expireDate", call.get("expireDate"));
    if (call.containsKey("productionDate")) payload.put("productionDate", call.get("productionDate"));
    if (call.get("tagNames") instanceof List<?>) {
      payload.put("tagIds", TreeMatch.resolveTagIds(ctx.tree, tagNames(call.get("tagNames"))).tagIds());
    }
    if (call.get("spaceName") != null || call.get("locationName") != null) {
      Map<String, Object> space =
          TreeMatch.matchSpace(
              ctx.tree,
              ToolHelpers.str(call.get("spaceName")).isEmpty()
                  ? ToolHelpers.str(row.get("spaceName"))
                  : ToolHelpers.str(call.get("spaceName")));
      if (space == null) {
        return ToolResult.fail("第 " + step + " 步失败：空间不在家庭结构里").build();
      }
      payload.put("spaceId", space.get("id"));
      if (call.get("locationName") != null) {
        ToolHelpers.LocationEnsure loc =
            ToolHelpers.ensureLocation(ctx, space, ToolHelpers.str(call.get("locationName")));
        if (loc.errorMessage() != null) {
          return ToolResult.fail("第 " + step + " 步失败：" + loc.errorMessage()).build();
        }
        payload.put("locationId", loc.locationId());
      }
    }
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.itemService.update(payload));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + row.get("name") + " — " + ToolHelpers.msg(res)).build();
    }
    String summary = buildUpdateSummary(row, call);
    return ToolResult.ok(summary)
        .wrote(true)
        .remember(
            ToolResult.rememberItem(
                ToolHelpers.str(row.get("itemId")),
                ToolHelpers.str(row.get("name")),
                "update",
                row.get("quantity"),
                call.containsKey("quantity") ? call.get("quantity") : row.get("quantity")))
        .build();
  }

  private ToolResult itemRemove(ToolContext ctx, Map<String, Object> call, int step) {
    Map<String, Object> row = ActRefs.lookupRef(call, ctx.refs);
    if (row == null) {
      return ToolResult.fail("没法确定要删哪一件，请再说一下物品名称和现在在哪").build();
    }
    Map<String, Object> payload = Map.of("itemId", row.get("itemId"), "source", "agent");
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.itemService.remove(payload));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + row.get("name") + " — " + ToolHelpers.msg(res)).build();
    }
    String qty = ToolHelpers.str(row.get("quantity")) + ToolHelpers.str(row.get("unit"));
    String place = TreeMatch.placeLabel(ToolHelpers.str(row.get("spaceName")), ToolHelpers.str(row.get("locationName")));
    String summary = "已删掉 " + row.get("name") + (qty.isBlank() ? "" : " " + qty) + (place.isEmpty() ? "" : "（" + place + "）");
    return ToolResult.ok(summary).wrote(true).build();
  }

  private ToolResult itemRemoveMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<Map<String, Object>> bound = ActRefs.bindCallIds(List.of(call), ctx.refs);
    Map<String, Object> b = bound.get(0);
    @SuppressWarnings("unchecked")
    List<String> ids = (List<String>) b.get("itemIds");
    if (ids == null || ids.size() < 1) {
      return ToolResult.fail("没法确定要删哪几件").build();
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("itemIds", ids);
    payload.put("source", "agent");
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.itemService.removeMany(payload));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    return ToolResult.ok("已删掉 " + ids.size() + " 件物资").wrote(true).build();
  }

  private ToolResult itemMerge(ToolContext ctx, Map<String, Object> call, int step) {
    List<Map<String, Object>> bound = ActRefs.bindCallIds(List.of(call), ctx.refs);
    Map<String, Object> b = bound.get(0);
    @SuppressWarnings("unchecked")
    List<String> itemIds = (List<String>) b.get("itemIds");
    if (itemIds == null || itemIds.size() < 2) {
      return ToolResult.fail("第 " + step + " 步失败：合并至少需要两条物资").build();
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("itemIds", itemIds);
    payload.put("name", call.get("name"));
    payload.put("source", "agent");
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.itemService.merge(payload));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> data = (Map<String, Object>) res.get("data");
    String kept = data != null ? ToolHelpers.str(data.get("name")) : ToolHelpers.str(call.get("name"));
    return ToolResult.ok("已合并为 " + kept + "（" + itemIds.size() + " 条）").wrote(true).build();
  }

  private ToolResult spaceCreate(ToolContext ctx, Map<String, Object> call, int step) {
    String name = ToolHelpers.str(call.get("name"));
    if (name.isEmpty()) {
      name = ToolHelpers.str(call.get("spaceName")).trim();
    }
    if (name.isEmpty()) {
      return ToolResult.fail("第 " + step + " 步失败：缺少空间名称").build();
    }
    String finalName = name;
    Map<String, Object> res = ToolHelpers.runService(() -> ctx.spaceService.create(Map.of("name", finalName)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> data = (Map<String, Object>) res.get("data");
    FamilyTreeService.patchSpaceIntoTree(ctx.tree, data);
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已新建空间「" + ToolHelpers.str(data.get("name")) + "」").wrote(true).build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult spaceCreateMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<Map<String, Object>> spaces = new ArrayList<>();
    if (call.get("spaces") instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          spaces.add((Map<String, Object>) m);
        }
      }
    }
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.spaceService.createMany(Map.of("spaces", spaces)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已新建 " + spaces.size() + " 个空间").wrote(true).build();
  }

  private ToolResult spaceCreateLocation(ToolContext ctx, Map<String, Object> call, int step) {
    Map<String, Object> space = TreeMatch.matchSpace(ctx.tree, ToolHelpers.str(call.get("spaceName")));
    if (space == null) {
      return ToolResult.fail("第 " + step + " 步失败：空间不存在").build();
    }
    ToolHelpers.LocationEnsure loc = ToolHelpers.ensureLocation(ctx, space, ToolHelpers.str(call.get("locationName")));
    if (loc.errorMessage() != null) {
      return ToolResult.fail("第 " + step + " 步失败：" + loc.errorMessage()).build();
    }
    return ToolResult.ok("已新建位置「" + loc.locationName() + "」").wrote(true).build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult spaceCreateLocationMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<Map<String, Object>> locs = new ArrayList<>();
    if (call.get("locations") instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          locs.add((Map<String, Object>) m);
        }
      }
    }
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.spaceService.createLocationMany(Map.of("locations", locs)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已新建 " + locs.size() + " 个位置").wrote(true).build();
  }

  private ToolResult spaceRemove(ToolContext ctx, Map<String, Object> call, int step) {
    Map<String, Object> space = TreeMatch.matchSpace(ctx.tree, ToolHelpers.str(call.get("spaceName")));
    if (space == null) {
      return ToolResult.fail("第 " + step + " 步失败：空间不存在").build();
    }
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.spaceService.remove(Map.of("spaceId", space.get("id"))));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已删除空间「" + space.get("name") + "」").wrote(true).build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult spaceRemoveMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<String> names = namesFromCall(call);
    List<Map<String, Object>> spaces = new ArrayList<>();
    for (String n : names) {
      spaces.add(Map.of("name", n));
    }
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.spaceService.removeMany(Map.of("spaces", spaces)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已删除 " + names.size() + " 个空间").wrote(true).build();
  }

  private ToolResult spaceRemoveLocation(ToolContext ctx, Map<String, Object> call, int step) {
    Map<String, Object> space = TreeMatch.matchSpace(ctx.tree, ToolHelpers.str(call.get("spaceName")));
    Map<String, Object> loc =
        space != null ? TreeMatch.matchLocation(space, ToolHelpers.str(call.get("locationName"))) : null;
    if (space == null || loc == null) {
      return ToolResult.fail("第 " + step + " 步失败：空间或位置不存在").build();
    }
    Map<String, Object> res =
        ToolHelpers.runService(
            () ->
                ctx.spaceService.removeLocation(
                    Map.of("spaceId", space.get("id"), "locationId", loc.get("id"))));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已删除位置").wrote(true).build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult spaceRemoveLocationMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<Map<String, Object>> locs = new ArrayList<>();
    if (call.get("locations") instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          locs.add((Map<String, Object>) m);
        }
      }
    }
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.spaceService.removeLocationMany(Map.of("locations", locs)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已删除 " + locs.size() + " 个位置").wrote(true).build();
  }

  private ToolResult tagCreate(ToolContext ctx, Map<String, Object> call, int step) {
    String name = ToolHelpers.str(call.get("name"));
    if (name.isEmpty()) {
      name = ToolHelpers.str(call.get("tagName")).trim();
    }
    final String tagName = name;
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.tagService.create(Map.of("name", tagName)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> data = (Map<String, Object>) res.get("data");
    FamilyTreeService.patchTagIntoTree(ctx.tree, data);
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已新建标签「" + tagName + "」").wrote(true).build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult tagCreateMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<Map<String, Object>> tags = new ArrayList<>();
    if (call.get("tags") instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          tags.add((Map<String, Object>) m);
        }
      }
    } else {
      for (String n : namesFromCall(call)) {
        tags.add(Map.of("name", n));
      }
    }
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.tagService.createMany(Map.of("tags", tags)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已新建 " + tags.size() + " 个标签").wrote(true).build();
  }

  private ToolResult tagRemove(ToolContext ctx, Map<String, Object> call, int step) {
    String name = ToolHelpers.str(call.get("name"));
    if (name.isEmpty()) {
      name = ToolHelpers.str(call.get("tagName")).trim();
    }
    final String tagName = name;
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.tagService.remove(Map.of("name", tagName)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已删除标签「" + tagName + "」").wrote(true).build();
  }

  @SuppressWarnings("unchecked")
  private ToolResult tagRemoveMany(ToolContext ctx, Map<String, Object> call, int step) {
    List<String> names = namesFromCall(call);
    Map<String, Object> res =
        ToolHelpers.runService(() -> ctx.tagService.removeMany(Map.of("names", names)));
    if (!ToolHelpers.ok(res)) {
      return ToolResult.fail("第 " + step + " 步失败：" + ToolHelpers.msg(res)).build();
    }
    FamilyTreeService.markTreeDirty(ctx);
    return ToolResult.ok("已删除 " + names.size() + " 个标签").wrote(true).build();
  }

  private ToolResult expireSubscribePanel(ToolContext ctx, int step) {
    java.util.Set<String> subscribed =
        itemRepository.subscribedItemIds(ctx.familyId, ctx.openid);
    List<ItemRow> all = itemsProbe.listItemsCompact(ctx.familyId, null, null, List.of(), 100);
    List<ItemRow> withExpire = new ArrayList<>();
    for (ItemRow row : all) {
      if (row.expireDate() != null) {
        withExpire.add(row);
      }
    }
    withExpire.sort(
        (a, b) -> String.valueOf(a.expireDate()).compareTo(String.valueOf(b.expireDate())));
    List<Map<String, Object>> items = new ArrayList<>();
    for (ItemRow row : withExpire) {
      Map<String, Object> item = itemRowMap(row);
      TreeMatch.PlaceNames place = TreeMatch.placeNamesForItem(item, ctx.tree);
      Map<String, Object> one = new LinkedHashMap<>();
      one.put("itemId", row.id());
      one.put("name", row.name() == null || row.name().isBlank() ? "未命名" : row.name());
      one.put("expireDate", row.expireDate());
      one.put("spaceName", place.spaceName());
      one.put("locationName", place.locationName());
      one.put("placeLabel", TreeMatch.placeLabel(place.spaceName(), place.locationName()));
      one.put("expireReminderEnabled", subscribed.contains(row.id()));
      items.add(one);
      if (items.size() >= 30) {
        break;
      }
    }
    String summary =
        items.isEmpty()
            ? "还没有设置过期日的物资。先给物资加上过期日期，再来订阅临期提醒。"
            : "临期提醒要你本人点开关授权。下面是已设过期日的物资，打开即可订阅：";
    return ToolResult.ok(summary).ui("subscribePanel").subscribeItems(items).build();
  }

  private ToolResult habitList(ToolContext ctx, int step) {
    List<FamilyHabit> habits = familyHabitService.list(ctx.familyId);
    List<Map<String, Object>> rows = new ArrayList<>();
    StringBuilder fact = new StringBuilder("habit.list ").append(habits.size());
    for (FamilyHabit h : habits) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("slot", h.slot());
      row.put("label", HabitSlots.label(h.slot()));
      row.put("text", h.text());
      boolean defaultSpaceOk =
          !HabitSlots.DEFAULT_SPACE.equals(h.slot())
              || TreeMatch.exactSpaceName(ctx.tree, h.text()) != null;
      if (!defaultSpaceOk) {
        row.put("needsResplit", true);
      }
      rows.add(row);
      fact.append('\n')
          .append("- ")
          .append(HabitSlots.label(h.slot()))
          .append('(')
          .append(h.slot())
          .append(")：")
          .append(h.text());
      if (!defaultSpaceOk) {
        fact.append("（非纯空间名，记一笔时勿直接当 spaceName；应拆成空间名 + 其它槽重记）");
      }
    }
    // 机器向事实：喂重编排；对家人说话由模型 reply/present，勿在此写气泡文案
    return ToolResult.ok(fact.toString()).habits(rows).build();
  }

  private ToolResult habitObserve(ToolContext ctx, int step) {
    Map<String, Object> observe = habitObserveService.observe(ctx.familyId, List.of());
    String summary = HabitObserveService.renderForModel(observe);
    return ToolResult.ok(summary.startsWith("habit.observe") ? summary : "habit.observe\n" + summary)
        .observe(observe)
        .build();
  }

  private ToolResult habitUpsert(ToolContext ctx, Map<String, Object> call, int step) {
    try {
      String slot = ToolHelpers.str(call.get("slot")).trim();
      String text = ToolHelpers.str(call.get("text"));
      if (text.isEmpty()) {
        text = ToolHelpers.str(call.get("value"));
      }
      text = text.trim();
      if (HabitSlots.DEFAULT_SPACE.equals(slot)) {
        String spaceName = TreeMatch.exactSpaceName(ctx.tree, text);
        if (spaceName == null) {
          return ToolResult.fail(
                  "「默认落点」只能写成家里已有的空间名（如客厅），不要写长句，也不要把多条规则拼进这一条。"
                      + "按品类另放哪儿请用 focus 另记一条。")
              .build();
        }
        text = spaceName;
      }
      familyHabitService.upsert(ctx.familyId, slot, text);
      return ToolResult.ok("已记下 " + HabitSlots.label(slot) + "：" + text)
          .wrote(true)
          .build();
    } catch (ApiException e) {
      return ToolResult.fail(e.getMessage()).build();
    }
  }

  private ToolResult habitRemove(ToolContext ctx, Map<String, Object> call, int step) {
    try {
      String slot = ToolHelpers.str(call.get("slot"));
      familyHabitService.remove(ctx.familyId, slot);
      return ToolResult.ok("已删掉 " + HabitSlots.label(slot.trim()) + "：习惯")
          .wrote(true)
          .build();
    } catch (ApiException e) {
      return ToolResult.fail(e.getMessage()).build();
    }
  }

  private ToolResult knowledgeGet(ToolContext ctx, Map<String, Object> call, int step) {
    ctx.knowledgeGetCount++;
    if (ctx.knowledgeGetCount > KnowledgePacks.MAX_GETS_PER_ACT) {
      return ToolResult.fail("第 " + step + " 步：本轮知识读取已达上限，请下轮再问").build();
    }
    String topicId = ToolHelpers.str(call.get("topicId"));
    if (topicId.isEmpty()) {
      topicId = ToolHelpers.str(call.get("id"));
    }
    if (topicId.isEmpty()) {
      topicId = ToolHelpers.str(call.get("name")).trim();
    }
    if (topicId.isEmpty()) {
      return ToolResult.fail("第 " + step + " 步：请指定 topicId（见知识目录）").build();
    }
    if (KnowledgePacks.get(topicId) == null) {
      return ToolResult.fail("第 " + step + " 步：没有「" + topicId + "」这条知识，请只使用目录里的 topicId").build();
    }
    List<String> liveFacts = null;
    if ("capacity".equals(topicId)) {
      try {
        liveFacts = knowledgeService.loadCapacityLiveFacts(ctx.familyId);
      } catch (Exception e) {
        liveFacts = List.of("（本家用量暂时读不到，规则说明仍有效。）");
      }
    }
    Map<String, Object> doc = knowledgeService.loadTopic(topicId, ctx.familyId, liveFacts);
    if (doc == null) {
      return ToolResult.fail("第 " + step + " 步：知识加载失败").build();
    }
    List<String> shortBits = new ArrayList<>();
    shortBits.add(String.valueOf(doc.get("title")));
    if (liveFacts != null) {
      liveFacts.stream().limit(3).forEach(shortBits::add);
    }
    if (shortBits.size() < 2) {
      shortBits.add("已取回产品说明，请用短句回答家人。");
    }
    Map<String, Object> knowledge =
        Map.of(
            "topicId", doc.get("topicId"),
            "title", doc.get("title"),
            "version", doc.get("version"),
            "body", doc.get("body"));
    return ToolResult.ok(String.join("\n", shortBits)).knowledge(knowledge).build();
  }

  private ToolResult pageGet(ToolContext ctx, Map<String, Object> call, int step) {
    ctx.pageGetCount++;
    if (ctx.pageGetCount > PageRegistry.MAX_GETS_PER_ACT) {
      return ToolResult.fail("第 " + step + " 步：本轮页面读取已达上限，请下轮再试").build();
    }
    String pageId = ToolHelpers.str(call.get("pageId"));
    if (pageId.isEmpty()) {
      pageId = ToolHelpers.str(call.get("id"));
    }
    if (pageId.isEmpty()) {
      pageId = ToolHelpers.str(call.get("name")).trim();
    }
    boolean open = wantOpen(call);
    Map<String, Object> query = new LinkedHashMap<>();
    if (call.get("query") instanceof Map<?, ?> qm) {
      query.putAll((Map<String, Object>) qm);
    }
    if (call.get("ref") != null && !query.containsKey("ref")) {
      query.put("ref", call.get("ref"));
    }
    if (call.get("itemId") != null && !query.containsKey("id")) {
      query.put("id", call.get("itemId"));
    }
    if (open) {
      if (pageId.isEmpty()) {
        return indexResult("第 " + step + " 步：打开页面前需要 pageId，已取回目录");
      }
      Map<String, Object> page = PageRegistry.getPage(pageId);
      if (page == null) {
        return indexResult("没有「" + pageId + "」这个页面，已取回目录，请用目录里的 pageId");
      }
      PageRegistry.NavResult built =
          PageRegistry.buildNavUrl(String.valueOf(page.get("pageId")), query, ctx.refs);
      if (!built.ok()) {
        return ToolResult.fail("第 " + step + " 步：无法打开「" + page.get("pageId") + "」——" + built.error()).build();
      }
      String label = ToolHelpers.str(call.get("label")).isEmpty() ? built.label() : ToolHelpers.str(call.get("label"));
      Map<String, Object> link =
          Map.of("label", label, "url", built.url(), "pageId", built.pageId());
      return ToolResult.ok(label).ui("navLinks").navLinks(List.of(link)).build();
    }
    if (pageId.isEmpty()) {
      return indexResult(null);
    }
    Map<String, Object> page = PageRegistry.getPage(pageId);
    if (page == null) {
      return indexResult("没有「" + pageId + "」这个页面，已取回目录，请用目录里的 pageId");
    }
    String body = PageRegistry.renderPageContract(page);
    Map<String, Object> pageDoc =
        Map.of("kind", "page", "pageId", page.get("pageId"), "body", body);
    return ToolResult.ok("已取回页面说明：" + page.get("pageId")).pageDoc(pageDoc).build();
  }

  private ToolResult indexResult(String note) {
    String index = PageRegistry.renderIndex();
    Map<String, Object> pageDoc = Map.of("kind", "index", "body", index);
    return ToolResult.ok(note != null ? note : "已取回可直达页面目录").pageDoc(pageDoc).build();
  }

  private static boolean wantOpen(Map<String, Object> call) {
    if (Boolean.TRUE.equals(call.get("open"))) {
      return true;
    }
    if ("true".equalsIgnoreCase(String.valueOf(call.get("open")))) {
      return true;
    }
    return "open".equalsIgnoreCase(ToolHelpers.str(call.get("action")));
  }

  /**
   * 记入意图：同位置同名已有行则并入数量（多行先收成一条），直接告知，不先 ask。
   *
   * @return 已并入的结果；无同名则 null（继续 create）
   */
  private ToolResult foldCreateIntoExisting(
      ToolContext ctx,
      Map<String, Object> space,
      ToolHelpers.LocationEnsure loc,
      String name,
      Map<String, Object> call,
      int step) {
    List<ItemRow> existing =
        itemRepository.findDuplicates(
            ctx.familyId,
            ToolHelpers.str(space.get("id")),
            loc.locationId(),
            name);
    if (existing.isEmpty()) {
      return null;
    }

    String addUnit = ToolHelpers.str(call.get("unit")).trim();
    if (addUnit.isEmpty()) {
      addUnit = inferSharedUnit(ctx.familyId, name);
    }
    for (ItemRow row : existing) {
      String u = row.unit() == null ? "" : row.unit().trim();
      if (!addUnit.isEmpty() && !u.isEmpty() && !addUnit.equals(u)) {
        return ToolResult.fail(
                "第 "
                    + step
                    + " 步：同位置「"
                    + name
                    + "」单位不一致（已有 "
                    + u
                    + "，本次 "
                    + addUnit
                    + "），未合并也未新建")
            .build();
      }
    }

    BigDecimal before =
        existing.stream()
            .map(r -> r.quantity() == null ? BigDecimal.ZERO : r.quantity())
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal add = parsePositiveQuantity(call.get("quantity"), BigDecimal.ONE);
    BigDecimal after = before.add(add);

    ItemRow keep = existing.get(0);
    if (existing.size() >= 2) {
      List<String> ids = existing.stream().map(ItemRow::id).toList();
      Map<String, Object> mergeBody = new LinkedHashMap<>();
      mergeBody.put("itemIds", ids);
      mergeBody.put("name", name);
      mergeBody.put("source", "agent");
      Map<String, Object> mergeRes =
          ToolHelpers.runService(() -> ctx.itemService.merge(mergeBody));
      if (!ToolHelpers.ok(mergeRes)) {
        return ToolResult.fail(
                "第 " + step + " 步失败：合并已有「" + name + "」— " + ToolHelpers.msg(mergeRes))
            .build();
      }
      @SuppressWarnings("unchecked")
      Map<String, Object> mergeData = (Map<String, Object>) mergeRes.get("data");
      String keepId =
          mergeData != null
              ? (ToolHelpers.str(mergeData.get("_id")).isEmpty()
                  ? ToolHelpers.str(mergeData.get("id"))
                  : ToolHelpers.str(mergeData.get("_id")))
              : keep.id();
      if (!keepId.isEmpty()) {
        keep =
            itemRepository
                .findById(keepId)
                .orElse(keep);
      }
      before =
          keep.quantity() == null ? BigDecimal.ZERO : keep.quantity(); // merge 已加总，after 仍 = before+add
      after = before.add(add);
    }

    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("itemId", keep.id());
    payload.put("quantity", after);
    payload.put("source", "agent");
    if (!addUnit.isEmpty()) {
      payload.put("unit", addUnit);
    } else if (keep.unit() != null && !keep.unit().isBlank()) {
      payload.put("unit", keep.unit());
    }
    if (call.get("note") != null && !ToolHelpers.str(call.get("note")).isBlank()) {
      payload.put("note", call.get("note"));
    }
    if (call.get("expireDate") != null) {
      payload.put("expireDate", call.get("expireDate"));
    }
    if (call.get("productionDate") != null) {
      payload.put("productionDate", call.get("productionDate"));
    }
    if (call.get("tagNames") instanceof List<?>) {
      payload.put(
          "tagIds", TreeMatch.resolveTagIds(ctx.tree, tagNames(call.get("tagNames"))).tagIds());
    }
    Map<String, Object> upd =
        ToolHelpers.runService(() -> ctx.itemService.update(payload));
    if (!ToolHelpers.ok(upd)) {
      return ToolResult.fail(
              "第 " + step + " 步失败：并入「" + name + "」— " + ToolHelpers.msg(upd))
          .build();
    }

    String unit = addUnit.isEmpty() ? ToolHelpers.str(keep.unit()) : addUnit;
    String place = TreeMatch.placeLabel(ToolHelpers.str(space.get("name")), loc.locationName());
    String beforeText = stripTrailingZero(before) + unit;
    String afterText = stripTrailingZero(after) + unit;
    String summary =
        "已并入现有 "
            + name
            + "："
            + beforeText
            + "→"
            + afterText
            + (place.isEmpty() ? "" : "（" + place + "）");
    return ToolResult.ok(summary)
        .wrote(true)
        .remember(
            ToolResult.rememberItem(
                keep.id(),
                name,
                "update",
                beforeText,
                afterText))
        .build();
  }

  private static BigDecimal parsePositiveQuantity(Object raw, BigDecimal fallback) {
    if (raw == null || "".equals(raw)) {
      return fallback;
    }
    try {
      BigDecimal q = new BigDecimal(String.valueOf(raw).trim());
      if (q.compareTo(BigDecimal.ZERO) <= 0) {
        return fallback;
      }
      return q.stripTrailingZeros();
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  private static String stripTrailingZero(BigDecimal q) {
    if (q == null) {
      return "0";
    }
    return q.stripTrailingZeros().toPlainString();
  }

  private static List<String> tagNames(Object raw) {
    List<String> out = new ArrayList<>();
    if (raw instanceof List<?> list) {
      for (Object o : list) {
        String s = ToolHelpers.str(o).trim();
        if (!s.isEmpty()) {
          out.add(s);
        }
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static List<String> namesFromCall(Map<String, Object> call) {
    List<String> names = new ArrayList<>();
    if (call.get("names") instanceof List<?> nl) {
      for (Object n : nl) {
        String s = ToolHelpers.str(n).trim();
        if (!s.isEmpty()) {
          names.add(s);
        }
      }
    }
    return names;
  }

  private static Map<String, Object> itemRowMap(ItemRow row) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", row.id());
    m.put("name", row.name());
    m.put("quantity", row.quantity());
    m.put("unit", row.unit());
    m.put("spaceId", row.spaceId());
    m.put("locationId", row.locationId());
    m.put("expireDate", row.expireDate());
    m.put("note", row.note());
    m.put("tagIds", row.tagIds());
    return m;
  }

  /** 同名台账若单位一致，create 漏写 unit 时补上（不解析用户口语句式）。 */
  private String inferSharedUnit(String familyId, String name) {
    if (familyId == null || familyId.isBlank() || name == null || name.isBlank()) {
      return "";
    }
    List<ItemRow> rows = itemRepository.findByFamilyAndExactName(familyId, name, 20);
    String shared = null;
    for (ItemRow row : rows) {
      String u = row.unit() == null ? "" : row.unit().trim();
      if (u.isEmpty()) {
        continue;
      }
      if (shared == null) {
        shared = u;
      } else if (!shared.equals(u)) {
        return "";
      }
    }
    return shared == null ? "" : shared;
  }

  private static String buildUpdateSummary(Map<String, Object> row, Map<String, Object> call) {
    String name = ToolHelpers.str(row.get("name")).isEmpty() ? "物资" : ToolHelpers.str(row.get("name"));
    String place = TreeMatch.placeLabel(ToolHelpers.str(row.get("spaceName")), ToolHelpers.str(row.get("locationName")));
    List<String> parts = new ArrayList<>();
    if (call.containsKey("quantity")) {
      String before = ToolHelpers.str(row.get("quantity")) + ToolHelpers.str(row.get("unit"));
      String after = ToolHelpers.str(call.get("quantity")) + ToolHelpers.str(call.get("unit"));
      if (!before.equals(after)) {
        parts.add(before + "→" + after);
      }
    }
    String detail = parts.isEmpty() ? "已更新" : String.join("，", parts);
    return "已改 " + name + (place.isEmpty() ? "" : "（" + place + "）") + "：" + detail;
  }
}
