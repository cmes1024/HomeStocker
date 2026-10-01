package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of agent/refs.js */
public final class ActRefs {

  private ActRefs() {}

  public static boolean isShortRef(String value) {
    return str(value).trim().matches("(?i)^[FP]\\d+$");
  }

  public static Map<String, Object> compactItem(
      Map<String, Object> item, String ref, Map<String, Object> tree) {
    String itemId = str(item.get("_id"));
    if (itemId.isEmpty()) {
      itemId = str(item.get("id"));
    }
    String spaceId = str(item.get("spaceId"));
    Map<String, Object> space = !spaceId.isEmpty() ? findSpaceById(tree, spaceId) : null;
    if (space == null && !str(item.get("spaceName")).isEmpty()) {
      space = TreeMatch.matchSpace(tree, str(item.get("spaceName")));
    }
    Map<String, Object> loc = null;
    if (space != null) {
      String locId = str(item.get("locationId"));
      if (!locId.isEmpty()) {
        loc = findLocationById(space, locId);
      }
      if (loc == null && !str(item.get("locationName")).isEmpty()) {
        loc = TreeMatch.matchLocation(space, str(item.get("locationName")));
      }
    }
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("ref", ref);
    row.put("itemId", itemId);
    row.put("name", str(item.get("name")));
    row.put("quantity", item.get("quantity"));
    row.put("unit", str(item.get("unit")));
    row.put("spaceId", spaceId);
    row.put("locationId", str(item.get("locationId")));
    row.put(
        "spaceName",
        space != null ? str(space.get("name")) : str(item.get("spaceName")));
    row.put(
        "locationName",
        loc != null ? str(loc.get("name")) : str(item.get("locationName")));
    row.put("expireDate", item.get("expireDate"));
    row.put("productionDate", item.get("productionDate"));
    row.put("note", str(item.get("note")));
    Object tagIds = item.get("tagIds");
    row.put("tagIds", tagIds instanceof List<?> ? tagIds : List.of());
    return row;
  }

  public static String renderFocus(Map<String, Object> row) {
    if (row == null) {
      return "无";
    }
    String place =
        TreeMatch.placeLabel(str(row.get("spaceName")), str(row.get("locationName")));
    String qty = str(row.get("quantity")) + str(row.get("unit"));
    String expire = row.get("expireDate") != null ? " · 过期 " + row.get("expireDate") : "";
    String touch = "";
    String op = str(row.get("op")).trim();
    if ("update".equals(op)
        && row.get("quantityBefore") != null
        && row.get("quantityAfter") != null) {
      touch = " · 本轮 " + row.get("quantityBefore") + "→" + row.get("quantityAfter");
    } else if ("create".equals(op)) {
      touch = " · 本轮新开";
    } else if ("update".equals(op)) {
      touch = " · 本轮改过";
    }
    return "["
        + row.get("ref")
        + "] "
        + row.get("name")
        + " "
        + qty
        + (!place.isEmpty() ? " · " + place : "")
        + expire
        + touch;
  }

  public static String renderFocusList(List<Map<String, Object>> rows) {
    if (rows == null || rows.isEmpty()) {
      return "无";
    }
    StringBuilder sb = new StringBuilder();
    for (Map<String, Object> row : rows) {
      if (row == null) {
        continue;
      }
      if (sb.length() > 0) {
        sb.append('\n');
      }
      sb.append(renderFocus(row));
    }
    return sb.length() == 0 ? "无" : sb.toString();
  }

  public static String pickCallRef(Map<String, Object> call) {
    if (call == null) {
      return "";
    }
    String raw = str(call.get("ref"));
    if (raw.isEmpty()) {
      raw = str(call.get("itemRef"));
    }
    if (!raw.isEmpty()) {
      return raw.trim();
    }
    Object refs = call.get("refs");
    if (refs instanceof List<?> list && !list.isEmpty()) {
      return str(list.get(0)).trim();
    }
    return "";
  }

  public static Map<String, Object> lookupRef(
      Map<String, Object> call, Map<String, Map<String, Object>> refs) {
    String itemId = str(call != null ? call.get("itemId") : null).trim();
    if (!itemId.isEmpty() && refs != null) {
      for (Map<String, Object> row : refs.values()) {
        if (row != null && itemId.equals(str(row.get("itemId")))) {
          return row;
        }
      }
      Map<String, Object> stub = new LinkedHashMap<>();
      stub.put("ref", pickCallRef(call).isEmpty() ? "X" : pickCallRef(call));
      stub.put("itemId", itemId);
      stub.put("name", str(call.get("name")));
      stub.put("spaceName", "");
      stub.put("locationName", "");
      return stub;
    }
    String raw = pickCallRef(call);
    if (isShortRef(raw) && refs != null) {
      Map<String, Object> hit = refs.get(raw.toUpperCase());
      if (hit != null) {
        return hit;
      }
    }
    String name = str(call != null ? call.get("name") : null).trim();
    if (name.isEmpty() || refs == null) {
      return null;
    }
    List<Map<String, Object>> hits = new ArrayList<>();
    for (Map<String, Object> row : refs.values()) {
      if (row != null && name.equals(str(row.get("name")))) {
        hits.add(row);
      }
    }
    if (hits.size() == 1) {
      return hits.get(0);
    }
    String fromSpace = str(call.get("fromSpaceName"));
    if (fromSpace.isEmpty()) {
      fromSpace = str(call.get("sourceSpaceName"));
    }
    String fromLoc = str(call.get("fromLocationName"));
    if (fromLoc.isEmpty()) {
      fromLoc = str(call.get("sourceLocationName"));
    }
    if (fromSpace.isEmpty() && fromLoc.isEmpty()) {
      return null;
    }
    for (Map<String, Object> row : hits) {
      if (!fromSpace.isEmpty() && !fromSpace.equals(str(row.get("spaceName")))) {
        continue;
      }
      if (!fromLoc.isEmpty() && !fromLoc.equals(str(row.get("locationName")))) {
        continue;
      }
      return row;
    }
    return null;
  }

  public static List<Map<String, Object>> bindCallIds(
      List<Map<String, Object>> calls, Map<String, Map<String, Object>> refs) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (calls == null) {
      return out;
    }
    for (Map<String, Object> call : calls) {
      if (call == null) {
        out.add(call);
        continue;
      }
      String use = str(call.get("use")).trim();
      if ("item.merge".equals(use) || "item.removeMany".equals(use)) {
        out.add(bindMultiItemCall(call, refs));
        continue;
      }
      Map<String, Object> row = lookupRef(call, refs);
      if (row == null || str(row.get("itemId")).isEmpty()) {
        out.add(new LinkedHashMap<>(call));
        continue;
      }
      Map<String, Object> bound = new LinkedHashMap<>(call);
      bound.put("itemId", row.get("itemId"));
      bound.put("name", str(row.get("name")).isEmpty() ? call.get("name") : row.get("name"));
      if (!str(call.get("ref")).isEmpty()) {
        bound.put("ref", call.get("ref"));
      } else {
        bound.put("ref", row.get("ref"));
      }
      out.add(bound);
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> bindMultiItemCall(
      Map<String, Object> call, Map<String, Map<String, Object>> refs) {
    List<String> refList = new ArrayList<>();
    Object refsRaw = call.get("refs");
    if (refsRaw instanceof List<?> list) {
      for (Object o : list) {
        refList.add(str(o).trim());
      }
    } else if (call.get("ref") != null) {
      refList.add(str(call.get("ref")).trim());
    }
    List<String> hintNames = new ArrayList<>();
    if (call.get("names") instanceof List<?> nl) {
      for (Object n : nl) {
        String s = str(n).trim();
        if (!s.isEmpty()) {
          hintNames.add(s);
        }
      }
    }
    List<String> itemIds = new ArrayList<>();
    List<String> names = new ArrayList<>();

    for (String raw : refList) {
      Map<String, Object> row = lookupRef(Map.of("ref", raw), refs);
      pushRow(row, itemIds, names);
    }
    if (call.get("itemIds") instanceof List<?> idList) {
      for (Object id : idList) {
        String sid = str(id).trim();
        if (sid.isEmpty()) {
          continue;
        }
        Map<String, Object> row = lookupRef(Map.of("itemId", sid), refs);
        if (row == null) {
          row = Map.of("itemId", sid, "name", "");
        }
        pushRow(row, itemIds, names);
      }
    }

    if (hintNames.size() >= 2 || (itemIds.size() < 2 && hintNames.size() >= 2)) {
      List<String> altIds = new ArrayList<>();
      List<String> altNames = new ArrayList<>();
      boolean complete = true;
      for (String hn : hintNames) {
        Map<String, Object> row = matchNamePreferTurn(hn, refs, altIds);
        if (row == null || str(row.get("itemId")).isEmpty()) {
          complete = false;
          break;
        }
        altIds.add(str(row.get("itemId")));
        altNames.add(str(row.get("name")).isEmpty() ? hn : str(row.get("name")));
      }
      if (complete && altIds.size() >= 2) {
        if (itemIds.size() < altIds.size() || itemIds.size() < 2) {
          itemIds.clear();
          names.clear();
          itemIds.addAll(altIds);
          names.addAll(altNames);
        }
      }
    }

    Map<String, Object> bound = new LinkedHashMap<>(call);
    bound.put("refs", refList);
    bound.put("itemIds", itemIds);
    bound.put("names", names);
    bound.put("name", names.isEmpty() ? str(call.get("name")) : names.get(0));
    return bound;
  }

  private static void pushRow(
      Map<String, Object> row, List<String> itemIds, List<String> names) {
    if (row == null) {
      return;
    }
    String id = str(row.get("itemId"));
    if (id.isEmpty() || itemIds.contains(id)) {
      return;
    }
    itemIds.add(id);
    names.add(str(row.get("name")));
  }

  private static Map<String, Object> matchNamePreferTurn(
      String name, Map<String, Map<String, Object>> refs, List<String> usedIds) {
    String n = str(name).trim();
    if (n.isEmpty() || refs == null) {
      return null;
    }
    List<Map<String, Object>> hits = new ArrayList<>();
    for (Map<String, Object> row : refs.values()) {
      if (row == null) {
        continue;
      }
      String id = str(row.get("itemId"));
      if (n.equals(str(row.get("name"))) && !id.isEmpty() && !usedIds.contains(id)) {
        hits.add(row);
      }
    }
    Map<String, Object> pref = preferTurnRow(hits);
    return pref != null ? pref : (hits.size() == 1 ? hits.get(0) : null);
  }

  private static Map<String, Object> preferTurnRow(List<Map<String, Object>> hits) {
    if (hits == null || hits.isEmpty()) {
      return null;
    }
    if (hits.size() == 1) {
      return hits.get(0);
    }
    List<Map<String, Object>> probe = new ArrayList<>();
    for (Map<String, Object> r : hits) {
      if (str(r.get("ref")).matches("(?i)^P\\d+$")) {
        probe.add(r);
      }
    }
    if (!probe.isEmpty()) {
      probe.sort(
          (a, b) -> {
            int na = refNum(str(a.get("ref")));
            int nb = refNum(str(b.get("ref")));
            return Integer.compare(na, nb);
          });
      return probe.get(0);
    }
    for (Map<String, Object> r : hits) {
      if (str(r.get("ref")).matches("(?i)^F\\d+$")) {
        return r;
      }
    }
    return null;
  }

  private static int refNum(String ref) {
    try {
      return Integer.parseInt(ref.replaceAll("\\D", ""));
    } catch (Exception e) {
      return 99;
    }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> findSpaceById(Map<String, Object> tree, String spaceId) {
    Object raw = tree.get("spaces");
    if (!(raw instanceof List<?> list)) {
      return null;
    }
    for (Object o : list) {
      if (o instanceof Map<?, ?> m && spaceId.equals(str(m.get("id")))) {
        return (Map<String, Object>) m;
      }
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> findLocationById(Map<String, Object> space, String locId) {
    Object raw = space.get("locations");
    if (!(raw instanceof List<?> list)) {
      return null;
    }
    for (Object o : list) {
      if (o instanceof Map<?, ?> m && locId.equals(str(m.get("id")))) {
        return (Map<String, Object>) m;
      }
    }
    return null;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
