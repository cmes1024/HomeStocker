package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 本句与台账物资名的子串重合。长名先占区间，避免「大米」再命中里面的「米」。
 * 命中的名称按在句中出现的位置排序，短号才跟说话顺序一致。不根据话术选择接口。
 */
public final class NameRecall {

  public static final int MAX_NAMES = 8;

  private NameRecall() {}

  public static List<String> match(String text, List<String> catalogNames) {
    if (text == null || text.isBlank() || catalogNames == null || catalogNames.isEmpty()) {
      return List.of();
    }
    String haystack = text.toLowerCase(Locale.ROOT);
    List<String> sorted =
        catalogNames.stream()
            .filter(n -> n != null && !n.isBlank())
            .map(String::trim)
            .distinct()
            .sorted(
                Comparator.comparingInt(String::length)
                    .reversed()
                    .thenComparing(n -> n.toLowerCase(Locale.ROOT)))
            .toList();
    boolean[] used = new boolean[haystack.length()];
    List<Hit> hits = new ArrayList<>();
    for (String name : sorted) {
      String needle = name.toLowerCase(Locale.ROOT);
      if (skipNeedle(needle) || needle.length() > haystack.length()) {
        continue;
      }
      int from = 0;
      while (from <= haystack.length() - needle.length()) {
        int at = haystack.indexOf(needle, from);
        if (at < 0) {
          break;
        }
        if (!overlaps(used, at, needle.length()) && standsAlone(haystack, at, needle.length())) {
          mark(used, at, needle.length());
          hits.add(new Hit(at, name));
          break;
        }
        from = at + 1;
      }
    }
    return hits.stream()
        .sorted(Comparator.comparingInt(Hit::at).thenComparing(Hit::name))
        .limit(MAX_NAMES)
        .map(Hit::name)
        .toList();
  }

  private record Hit(int at, String name) {}

  private static boolean skipNeedle(String needle) {
    if (needle.isEmpty()) {
      return true;
    }
    return needle.length() == 1 && needle.charAt(0) < 128;
  }

  /** 单字只认句首、标点或并列词之后，避免「厘米」命中「米」。两字及以上仍按子串。 */
  private static final String SINGLE_CHAR_DELIMITERS = "的了是有在把将给和与跟或及从到去来还没不也都再又";

  private static boolean standsAlone(String haystack, int at, int len) {
    if (len != 1) {
      return true;
    }
    if (at == 0) {
      return true;
    }
    char prev = haystack.charAt(at - 1);
    return !Character.isLetterOrDigit(prev) || SINGLE_CHAR_DELIMITERS.indexOf(prev) >= 0;
  }

  private static boolean overlaps(boolean[] used, int at, int len) {
    for (int i = at; i < at + len; i++) {
      if (used[i]) {
        return true;
      }
    }
    return false;
  }

  private static void mark(boolean[] used, int at, int len) {
    for (int i = at; i < at + len; i++) {
      used[i] = true;
    }
  }
}
