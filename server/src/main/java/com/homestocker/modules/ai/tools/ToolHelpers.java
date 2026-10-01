package com.homestocker.modules.ai.tools;

import com.homestocker.common.ApiException;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import com.homestocker.modules.ai.agent.TreeMatch;
import com.homestocker.modules.family.app.FamilyTreeService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

public final class ToolHelpers {

  private ToolHelpers() {}

  public static Map<String, Object> runService(Supplier<Map<String, Object>> action) {
    try {
      Map<String, Object> data = action.get();
      Map<String, Object> wrap = new LinkedHashMap<>();
      wrap.put("ok", true);
      wrap.put("data", data);
      return wrap;
    } catch (ApiException e) {
      return Map.of("ok", false, "message", e.getMessage() != null ? e.getMessage() : "失败");
    }
  }

  public static boolean ok(Map<String, Object> res) {
    return res != null && Boolean.TRUE.equals(res.get("ok"));
  }

  public static String msg(Map<String, Object> res) {
    if (res == null) {
      return "失败";
    }
    Object m = res.get("message");
    return m != null ? String.valueOf(m) : "失败";
  }

  public record LocationEnsure(
      String locationId, String locationName, boolean created, String errorMessage) {}

  public static LocationEnsure ensureLocation(
      ToolContext ctx,
      Map<String, Object> space,
      String locationName) {
    String name = str(locationName).trim();
    if (name.isEmpty() || space == null) {
      return new LocationEnsure(null, "", false, null);
    }
    Map<String, Object> existing = TreeMatch.matchLocation(space, name);
    if (existing != null) {
      return new LocationEnsure(str(existing.get("id")), str(existing.get("name")), false, null);
    }
    if (!ctx.catalogMap.containsKey("space.createLocation")) {
      return new LocationEnsure(
          null, "", false, "位置「" + name + "」不在「" + space.get("name") + "」下");
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("spaceId", space.get("id"));
    body.put("name", name);
    Map<String, Object> created = runService(() -> ctx.spaceService.createLocation(body));
    if (!ok(created)) {
      return new LocationEnsure(null, "", false, msg(created));
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> data = (Map<String, Object>) created.get("data");
    if (data == null) {
      data = created;
    }
    String locId = str(data.get("_id"));
    if (locId.isEmpty()) {
      locId = str(data.get("id"));
    }
    Map<String, Object> locDoc = Map.of("id", locId, "name", name);
    FamilyTreeService.patchLocationIntoTree(ctx.tree, str(space.get("id")), locDoc);
    FamilyTreeService.markTreeDirty(ctx);
    return new LocationEnsure(locId, name, true, null);
  }

  public static List<ItemRow> findDuplicates(
      ItemRepository repo, String familyId, String spaceId, String locationId, String name) {
    return repo.findDuplicates(familyId, spaceId, locationId, name);
  }

  public static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
