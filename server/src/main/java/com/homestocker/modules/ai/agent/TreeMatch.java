package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of agent/treeMatch.js */
public final class TreeMatch {

  private TreeMatch() {}

  @SuppressWarnings("unchecked")
  public static Map<String, Object> matchSpace(Map<String, Object> tree, String name) {
    String n = str(name).trim();
    if (n.isEmpty()) {
      return null;
    }
    for (Map<String, Object> s : spaces(tree)) {
      if (n.equals(str(s.get("name")))) {
        return s;
      }
    }
    for (Map<String, Object> s : spaces(tree)) {
      String sn = str(s.get("name"));
      if (!sn.isEmpty() && (sn.contains(n) || n.contains(sn))) {
        return s;
      }
    }
    return null;
  }

  /** Exact space name only (habit default_space). No fuzzy contains — avoids swallowing compound prose. */
  public static String exactSpaceName(Map<String, Object> tree, String name) {
    String n = str(name).trim();
    if (n.isEmpty()) {
      return null;
    }
    for (Map<String, Object> s : spaces(tree)) {
      String sn = str(s.get("name")).trim();
      if (!sn.isEmpty() && sn.equals(n)) {
        return sn;
      }
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> matchLocation(Map<String, Object> space, String name) {
    String n = str(name).trim();
    if (n.isEmpty()) {
      return null;
    }
    for (Map<String, Object> l : locations(space)) {
      if (n.equals(str(l.get("name")))) {
        return l;
      }
    }
    for (Map<String, Object> l : locations(space)) {
      String ln = str(l.get("name"));
      if (!ln.isEmpty() && (ln.contains(n) || n.contains(ln))) {
        return l;
      }
    }
    return null;
  }

  public static Map<String, Object> matchTag(Map<String, Object> tree, String name) {
    String n = str(name).trim();
    if (n.isEmpty()) {
      return null;
    }
    for (Map<String, Object> t : tags(tree)) {
      if (n.equals(str(t.get("name")))) {
        return t;
      }
    }
    return null;
  }

  public static TagResolve resolveTagIds(Map<String, Object> tree, List<String> tagNames) {
    List<String> ids = new ArrayList<>();
    List<String> resolved = new ArrayList<>();
    if (tagNames != null) {
      for (String raw : tagNames) {
        Map<String, Object> tag = matchTag(tree, raw);
        if (tag != null) {
          String id = str(tag.get("id"));
          if (!id.isEmpty() && !ids.contains(id)) {
            ids.add(id);
            resolved.add(str(tag.get("name")));
          }
        }
      }
    }
    return new TagResolve(ids, resolved);
  }

  public record TagResolve(List<String> tagIds, List<String> tagNames) {}

  public static String placeLabel(String spaceName, String locationName) {
    List<String> bits = new ArrayList<>();
    if (spaceName != null && !spaceName.isBlank()) {
      bits.add(spaceName.trim());
    }
    if (locationName != null && !locationName.isBlank()) {
      bits.add(locationName.trim());
    }
    return String.join(" / ", bits);
  }

  public static PlaceNames placeNamesForItem(Map<String, Object> item, Map<String, Object> tree) {
    String spaceId = str(item.get("spaceId"));
    String spaceName = str(item.get("spaceName"));
    Map<String, Object> space =
        spaces(tree).stream()
            .filter(s -> spaceId.equals(str(s.get("id"))) || spaceName.equals(str(s.get("name"))))
            .findFirst()
            .orElse(null);
    Map<String, Object> loc = null;
    if (space != null) {
      String locId = str(item.get("locationId"));
      String locName = str(item.get("locationName"));
      loc =
          locations(space).stream()
              .filter(
                  l -> locId.equals(str(l.get("id"))) || locName.equals(str(l.get("name"))))
              .findFirst()
              .orElse(null);
    }
    return new PlaceNames(
        space != null ? str(space.get("name")) : spaceName,
        loc != null ? str(loc.get("name")) : str(item.get("locationName")));
  }

  public record PlaceNames(String spaceName, String locationName) {}

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> spaces(Map<String, Object> tree) {
    Object raw = tree != null ? tree.get("spaces") : null;
    if (!(raw instanceof List<?> list)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object o : list) {
      if (o instanceof Map<?, ?> m) {
        out.add((Map<String, Object>) m);
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> tags(Map<String, Object> tree) {
    Object raw = tree != null ? tree.get("tags") : null;
    if (!(raw instanceof List<?> list)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object o : list) {
      if (o instanceof Map<?, ?> m) {
        out.add((Map<String, Object>) m);
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> locations(Map<String, Object> space) {
    Object raw = space != null ? space.get("locations") : null;
    if (!(raw instanceof List<?> list)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object o : list) {
      if (o instanceof Map<?, ?> m) {
        out.add((Map<String, Object>) m);
      }
    }
    return out;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
