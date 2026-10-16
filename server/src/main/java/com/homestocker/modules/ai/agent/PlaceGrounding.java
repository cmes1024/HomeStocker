package com.homestocker.modules.ai.agent;

import java.util.List;
import java.util.Map;

/**
 * 新建物资的空间和位置必须能对上本句，或对上这家的默认落点。
 * 对不上就退回给模型去问，不按句子猜该记到哪。
 */
public final class PlaceGrounding {

  private PlaceGrounding() {}

  public static String ungrounded(
      String userText, String habitSpace, Map<String, Object> tree, Map<String, Object> call) {
    if (call == null) {
      return null;
    }
    String use = str(call.get("use"));
    if ("item.createMany".equals(use) && call.get("items") instanceof List<?> items) {
      for (Object item : items) {
        if (!(item instanceof Map<?, ?> row)) {
          continue;
        }
        String why = one(userText, habitSpace, tree, str(row.get("spaceName")), str(row.get("locationName")));
        if (why != null) {
          return why;
        }
      }
      return null;
    }
    if (!"item.create".equals(use)) {
      return null;
    }
    return one(userText, habitSpace, tree, str(call.get("spaceName")), str(call.get("locationName")));
  }

  static String one(
      String userText, String habitSpace, Map<String, Object> tree, String spaceName, String locationName) {
    String space = spaceName == null ? "" : spaceName.trim();
    String loc = locationName == null ? "" : locationName.trim();
    String text = userText == null ? "" : userText;
    if (space.isEmpty() && loc.isEmpty()) {
      return "没有落点。先问放在哪，不要自己从家庭结构里挑。";
    }
    boolean spaceSaid = !space.isEmpty() && text.contains(space);
    boolean locSaid = !loc.isEmpty() && text.contains(loc);
    boolean habit = !space.isEmpty() && space.equals(habitSpace == null ? "" : habitSpace.trim());
    boolean locExists = locExists(tree, space, loc);
    if (locSaid && locExists) {
      return null;
    }
    if (spaceSaid || habit) {
      if (loc.isEmpty() || locSaid) {
        return null;
      }
      return "位置「" + loc + "」不是本句说的。先问放在哪，不要自己挑。";
    }
    if (!space.isEmpty()) {
      return "空间「" + space + "」不是本句说的，也没有默认落点。先问放在哪，不要自己挑。";
    }
    return "位置「" + loc + "」不在家庭结构里。先问放在哪。";
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

  @SuppressWarnings("unchecked")
  private static boolean locExists(Map<String, Object> tree, String spaceName, String locationName) {
    if (tree == null || spaceName.isEmpty() || locationName.isEmpty()) {
      return false;
    }
    Object raw = tree.get("spaces");
    if (!(raw instanceof List<?> spaces)) {
      return false;
    }
    for (Object spaceObj : spaces) {
      if (!(spaceObj instanceof Map<?, ?> space)) {
        continue;
      }
      if (!spaceName.equals(str(space.get("name")))) {
        continue;
      }
      Object locs = space.get("locations");
      if (!(locs instanceof List<?> list)) {
        return false;
      }
      for (Object locObj : list) {
        if (locObj instanceof Map<?, ?> loc && locationName.equals(str(loc.get("name")))) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }
}
