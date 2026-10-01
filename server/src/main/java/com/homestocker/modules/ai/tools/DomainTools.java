package com.homestocker.modules.ai.tools;

import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import com.homestocker.modules.ai.agent.ActRefs;
import com.homestocker.modules.ai.agent.ItemsProbe;
import com.homestocker.modules.ai.agent.Presentation;
import com.homestocker.modules.ai.agent.TreeMatch;
import com.homestocker.modules.ai.knowledge.KnowledgePacks;
import com.homestocker.modules.ai.knowledge.KnowledgeService;
import com.homestocker.modules.ai.pages.PageRegistry;
import com.homestocker.modules.family.app.FamilyTreeService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Tool handlers port of miniprogram/cloudfunctions/ai/tools/* */
@Component
public class DomainTools {

  private final ItemsProbe itemsProbe;
  private final KnowledgeService knowledgeService;
  private final ItemRepository itemRepository;

  public DomainTools(
      ItemsProbe itemsProbe, KnowledgeService knowledgeService, ItemRepository itemRepository) {
    this.itemsProbe = itemsProbe;
    this.knowledgeService = knowledgeService;
    this.itemRepository = itemRepository;
  }

  public ToolResult run(String use, ToolContext ctx, Map<String, Object> call, int step) {
    return switch (use) {
      case "item.search" -> itemSearch(ctx, call, step);
      case "item.listExpiring" -> itemListExpiring(ctx, step);
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
    List<String> keywords = keyword.isEmpty() ? List.of() : List.of(keyword.toLowerCase());
    String spaceId = space != null ? ToolHelpers.str(space.get("id")) : null;
    String locationId = loc != null ? ToolHelpers.str(loc.get("id")) : null;
    List<ItemRow> list = itemsProbe.listItemsCompact(ctx.familyId, spaceId, locationId, keywords, 100);
    List<Map<String, Object>> capped = new ArrayList<>();
    for (ItemRow row : list) {
      capped.add(itemRowMap(row));
    }
    Presentation.PresentationView inv =
        Presentation.buildInventoryPresentation(capped, ctx.tree, "查询", null);
    return ToolResult.ok(inv.lead()).inventory(capped).build();
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
    ToolHelpers.LocationEnsure loc = ToolHelpers.ensureLocation(ctx, space, ToolHelpers.str(call.get("locationName")));
    if (loc.errorMessage() != null) {
      return ToolResult.fail("第 " + step + " 步失败：" + loc.errorMessage()).build();
    }
    if (call.get("quantity") != null && "0".equals(String.valueOf(call.get("quantity")))) {
      return ToolResult.fail("第 " + step + " 步：新开物资数量不能是 0").build();
    }
    TreeMatch.TagResolve tags = TreeMatch.resolveTagIds(ctx.tree, tagNames(call.get("tagNames")));
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("name", name);
    payload.put("quantity", call.get("quantity"));
    payload.put("unit", call.get("unit"));
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
    String qty = ToolHelpers.str(call.get("quantity")) + ToolHelpers.str(call.get("unit"));
    String place = TreeMatch.placeLabel(ToolHelpers.str(space.get("name")), loc.locationName());
    String summary =
        "已记下 "
            + name
            + (qty.isBlank() ? "" : " " + qty)
            + (place.isEmpty() ? "" : "（" + place + "）");
    Map<String, Object> dup =
        Map.of(
            "name",
            name,
            "spaceId",
            space.get("id"),
            "locationId",
            loc.locationId() != null ? loc.locationId() : "",
            "spaceName",
            space.get("name"),
            "locationName",
            loc.locationName());
    return ToolResult.ok(summary)
        .wrote(true)
        .remember(ToolResult.rememberItem(ToolHelpers.str(data.get("_id")), name, "create", null, null))
        .duplicateCheck(dup)
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
      TreeMatch.TagResolve tags = TreeMatch.resolveTagIds(ctx.tree, tagNames(row.get("tagNames")));
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("name", name);
      payload.put("quantity", row.get("quantity"));
      payload.put("unit", row.get("unit"));
      payload.put("note", row.get("note"));
      payload.put("spaceId", space.get("id"));
      payload.put("locationId", loc.locationId());
      payload.put("tagIds", tags.tagIds());
      payload.put("expireDate", row.get("expireDate"));
      payload.put("productionDate", row.get("productionDate"));
      payload.put("source", "agent");
      payloads.add(payload);
      String qty = ToolHelpers.str(row.get("quantity")) + ToolHelpers.str(row.get("unit"));
      String place = TreeMatch.placeLabel(ToolHelpers.str(space.get("name")), loc.locationName());
      labels.add(name + (qty.isBlank() ? "" : " " + qty) + (place.isEmpty() ? "" : "（" + place + "）"));
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
    String preview =
        labels.size() <= 8
            ? String.join("、", labels)
            : String.join("、", labels.subList(0, 8)) + "等 " + labels.size() + " 件";
    return ToolResult.ok("已记下 " + preview).wrote(true).remember(remember).build();
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
