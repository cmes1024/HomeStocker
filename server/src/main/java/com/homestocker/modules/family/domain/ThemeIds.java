package com.homestocker.modules.family.domain;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Keep in sync with miniprogram/utils/theme.js and cloud family THEME_IDS. */
public final class ThemeIds {

  public static final Set<String> ALL =
      Set.of(
          "orange",
          "red",
          "blue",
          "matcha",
          "milk",
          "taro",
          "sakura",
          "coral",
          "mint",
          "warm-gray",
          "indigo",
          "amber",
          "forest",
          "berry",
          "clay",
          "lavender",
          "olive");

  public static final Map<String, Object> DEFAULT_BACKGROUND = Map.of("type", "theme", "value", "orange");

  private ThemeIds() {}

  public static Map<String, Object> normalizeBackground(Object raw) {
    if (raw instanceof Map<?, ?> map) {
      Object type = map.get("type");
      Object value = map.get("value");
      if ("theme".equals(type) && value != null && ALL.contains(String.valueOf(value))) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", "theme");
        out.put("value", String.valueOf(value));
        return out;
      }
    }
    return new LinkedHashMap<>(DEFAULT_BACKGROUND);
  }

  public static boolean isValidTheme(String value) {
    return value != null && ALL.contains(value);
  }
}
