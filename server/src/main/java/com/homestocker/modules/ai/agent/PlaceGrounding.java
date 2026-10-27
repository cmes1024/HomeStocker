package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 只核对家庭结构里有没有这个落点（空间必须存在；位置必须在该空间下）。
 * 「这句话有没有提这个落点」由 {@link Provenance} 按申报核验，不在这里猜。
 */
public final class PlaceGrounding {

  private PlaceGrounding() {}

  public static ToolFeedback check(Map<String, Object> tree, Map<String, Object> call) {
    if (call == null) {
      return null;
    }
    String use = str(call.get("use"));
    if ("item.createMany".equals(use) && call.get("items") instanceof List<?> items) {
      for (Object item : items) {
        if (!(item instanceof Map<?, ?> row)) {
          continue;
        }
        ToolFeedback bad = one(tree, str(row.get("spaceName")), str(row.get("locationName")), true);
        if (bad != null) {
          return bad;
        }
      }
      return null;
    }
    if ("item.create".equals(use)) {
      return one(tree, str(call.get("spaceName")), str(call.get("locationName")), true);
    }
    if ("item.update".equals(use)) {
      return one(tree, str(call.get("spaceName")), str(call.get("locationName")), false);
    }
    return null;
  }

  static ToolFeedback one(
      Map<String, Object> tree, String spaceName, String locationName, boolean requireSpace) {
    String space = spaceName == null ? "" : spaceName.trim();
    String loc = locationName == null ? "" : locationName.trim();
    List<String> spaces = spaceNames(tree);
    if (space.isEmpty()) {
      if (requireSpace) {
        return ToolFeedback.of(GroundingCodes.PLACE_UNGROUNDED, "spaceName", "")
            .withCandidates(spaces);
      }
      if (!loc.isEmpty()) {
        return ToolFeedback.of(GroundingCodes.PLACE_UNGROUNDED, "locationName", loc)
            .withCandidates(locationNames(tree, ""));
      }
      return null;
    }
    if (!spaces.contains(space)) {
      return ToolFeedback.of(GroundingCodes.PLACE_UNGROUNDED, "spaceName", space)
          .withCandidates(spaces);
    }
    if (!loc.isEmpty()) {
      List<String> locs = locationNames(tree, space);
      if (!locs.contains(loc)) {
        return ToolFeedback.of(GroundingCodes.PLACE_UNGROUNDED, "locationName", loc)
            .withCandidates(locs);
      }
    }
    return null;
  }

  public static String habitDefaultSpace(String rendered) {
    if (rendered == null || rendered.isBlank() || "无".equals(rendered.trim())) {
      return "";
    }
    for (String line : rendered.split("\n")) {
      int slot = line.indexOf("default_space");
      if (slot < 0) {
        continue;
      }
      int colon = line.indexOf('：', slot);
      if (colon < 0) {
        colon = line.indexOf(':', slot);
      }
      if (colon < 0 || colon + 1 >= line.length()) {
        return "";
      }
      String text = line.substring(colon + 1).trim();
      int note = text.indexOf('（');
      if (note >= 0) {
        text = text.substring(0, note).trim();
      }
      return text;
    }
    return "";
  }

  static List<String> spaceNames(Map<String, Object> tree) {
    List<String> out = new ArrayList<>();
    if (tree == null || !(tree.get("spaces") instanceof List<?> spaces)) {
      return out;
    }
    for (Object spaceObj : spaces) {
      if (spaceObj instanceof Map<?, ?> space) {
        String name = str(space.get("name"));
        if (!name.isEmpty() && !out.contains(name)) {
          out.add(name);
        }
      }
    }
    return out;
  }

  static List<String> locationNames(Map<String, Object> tree, String spaceName) {
    List<String> out = new ArrayList<>();
    if (tree == null || !(tree.get("spaces") instanceof List<?> spaces)) {
      return out;
    }
    for (Object spaceObj : spaces) {
      if (!(spaceObj instanceof Map<?, ?> space)) {
        continue;
      }
      if (!spaceName.isEmpty() && !spaceName.equals(str(space.get("name")))) {
        continue;
      }
      if (!(space.get("locations") instanceof List<?> list)) {
        continue;
      }
      for (Object locObj : list) {
        if (locObj instanceof Map<?, ?> loc) {
          String name = str(loc.get("name"));
          if (!name.isEmpty() && !out.contains(name)) {
            out.add(name);
          }
        }
      }
    }
    return out;
  }

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }
}
