package com.homestocker.modules.ai.agent;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 改现有物资时，只拦对不上本轮事实的写入：同名多条却没指明哪条、数量对不上这句话、
 * 落点不是这件现在的位置也不是本句说的、日期和标签本句没提到。
 * 不把句子改写成另一个动作。
 */
public final class WriteGrounding {

  private WriteGrounding() {}

  public static String blocked(
      String userText,
      String habitSpace,
      Map<String, Object> tree,
      List<Map<String, Object>> rows,
      Map<String, Object> call) {
    if (call == null) {
      return null;
    }
    String use = str(call.get("use"));
    if (!"item.update".equals(use)
        && !"item.remove".equals(use)
        && !"item.removeMany".equals(use)) {
      return null;
    }
    List<Map<String, Object>> pool = dedupe(rows);
    String same = sameName(userText, pool, call);
    if (same != null) {
      return same;
    }
    String mismatch = removeMismatch(userText, pool, call);
    if (mismatch != null) {
      return mismatch;
    }
    if (!"item.update".equals(use)) {
      return null;
    }
    String place = placeChange(userText, habitSpace, tree, pool, call);
    if (place != null) {
      return place;
    }
    String quantity = quantity(userText, pool, call);
    if (quantity != null) {
      return quantity;
    }
    String dates = dates(userText, call);
    if (dates != null) {
      return dates;
    }
    return tags(userText, call);
  }

  static String sameName(String userText, List<Map<String, Object>> rows, Map<String, Object> call) {
    String name = targetName(rows, call);
    if (name.isEmpty()) {
      return null;
    }
    List<Map<String, Object>> siblings = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      if (name.equals(str(row.get("name")))) {
        siblings.add(row);
      }
    }
    if (siblings.size() < 2) {
      return null;
    }
    if (pickedByRef(rows, call)) {
      return null;
    }
    Map<String, Object> target = findRow(rows, call);
    if (target != null && uniquely(userText, target, siblings)) {
      return null;
    }
    return "「" + name + "」有 " + siblings.size() + " 条，各条是不同的几件。先问是哪一条，不要挑一条改。";
  }

  /** 本轮短号 / itemId 唯一命中一条：模型已经点明是哪一条，不再要求本句里有文字线索。 */
  private static boolean pickedByRef(List<Map<String, Object>> rows, Map<String, Object> call) {
    String ref = ActRefs.pickCallRef(call);
    if (!ref.isEmpty() && hits(rows, "ref", ref)) {
      return true;
    }
    String itemId = str(call.get("itemId"));
    return !itemId.isEmpty() && hits(rows, "itemId", itemId);
  }

  private static boolean hits(List<Map<String, Object>> rows, String key, String want) {
    int n = 0;
    for (Map<String, Object> row : rows) {
      if (want.equalsIgnoreCase(str(row.get(key)))) {
        n++;
      }
    }
    return n == 1;
  }

  static String placeChange(
      String userText,
      String habitSpace,
      Map<String, Object> tree,
      List<Map<String, Object>> rows,
      Map<String, Object> call) {
    String space = str(call.get("spaceName"));
    String loc = str(call.get("locationName"));
    if (space.isEmpty() && loc.isEmpty()) {
      return null;
    }
    Map<String, Object> row = findRow(rows, call);
    if (row != null && !placeMoved(row, space, loc)) {
      return null;
    }
    String spaceForCheck = space.isEmpty() && row != null ? str(row.get("spaceName")) : space;
    return PlaceGrounding.one(userText, habitSpace, tree, spaceForCheck, loc);
  }

  /**
   * 整条删除只对应「现有这么多、这句话也是这么多」或没写数量。
   * 名称旁边的数量比库存大，或对不上现有数量时，不删。返回给家人的问句。
   */
  public static String removeMismatch(
      String userText, List<Map<String, Object>> rows, Map<String, Object> call) {
    if (call == null) {
      return null;
    }
    String use = str(call.get("use"));
    if (!"item.remove".equals(use) && !"item.removeMany".equals(use)) {
      return null;
    }
    for (Map<String, Object> row : targetRows(rows, call)) {
      BigDecimal prev = decimal(row.get("quantity"));
      if (prev == null) {
        continue;
      }
      List<BigDecimal> stated = quantitiesNear(userText, str(row.get("name")));
      if (stated.isEmpty()) {
        continue;
      }
      boolean exact = false;
      BigDecimal larger = null;
      BigDecimal other = null;
      for (BigDecimal n : stated) {
        if (n.compareTo(prev) == 0) {
          exact = true;
        } else if (n.compareTo(prev) > 0 && larger == null) {
          larger = n;
        } else if (other == null && n.compareTo(prev) != 0) {
          other = n;
        }
      }
      if (exact) {
        continue;
      }
      String name = str(row.get("name"));
      if (name.isEmpty()) {
        name = "这项";
      }
      String unit = str(row.get("unit"));
      String have = plain(prev) + unit;
      if (larger != null) {
        return name + "只有 " + have + "，不够 " + plain(larger) + unit + "。没有删掉。要改成多少，还是先不动？";
      }
      if (other != null) {
        return name
            + "现有 "
            + have
            + "，和这句话里的 "
            + plain(other)
            + " 对不上。整条删除会把账清掉。要改成多少？";
      }
    }
    return null;
  }

  static String quantity(String userText, List<Map<String, Object>> rows, Map<String, Object> call) {
    if (!call.containsKey("quantity")) {
      return null;
    }
    BigDecimal next = decimal(call.get("quantity"));
    if (next == null) {
      return null;
    }
    Map<String, Object> row = findRow(rows, call);
    if (row == null) {
      return null;
    }
    BigDecimal prev = decimal(row.get("quantity"));
    if (prev != null && prev.compareTo(next) == 0) {
      return null;
    }
    if (mentioned(userText, next)) {
      return null;
    }
    if (prev != null && mentioned(userText, next.subtract(prev).abs())) {
      return null;
    }
    return "要写成的数量对不上这句话。先问改成多少，不要自己定一个数。";
  }

  static String dates(String userText, Map<String, Object> call) {
    boolean expire = filled(call.get("expireDate"));
    boolean production = filled(call.get("productionDate"));
    if (!expire && !production) {
      return null;
    }
    String text = userText == null ? "" : userText;
    if (text.contains("过期") || text.contains("到期") || text.contains("保质") || text.contains("日期")) {
      return null;
    }
    return "本句没说改保质期或生产日期。不要自己改日期。";
  }

  static String tags(String userText, Map<String, Object> call) {
    if (!(call.get("tagNames") instanceof List<?> tags) || tags.isEmpty()) {
      return null;
    }
    boolean any = false;
    for (Object tag : tags) {
      if (!str(tag).isEmpty()) {
        any = true;
        break;
      }
    }
    if (!any) {
      return null;
    }
    String text = userText == null ? "" : userText;
    if (text.contains("标签") || text.contains("标成")) {
      return null;
    }
    return "本句没说改标签。不要自己加标签。";
  }

  private static boolean placeMoved(Map<String, Object> row, String space, String loc) {
    if (!space.isEmpty() && !space.equals(str(row.get("spaceName")))) {
      return true;
    }
    return !loc.isEmpty() && !loc.equals(str(row.get("locationName")));
  }

  private static boolean uniquely(
      String userText, Map<String, Object> target, List<Map<String, Object>> siblings) {
    String text = userText == null ? "" : userText;
    for (String clue : clues(target)) {
      if (clue.length() < 2 || !text.contains(clue)) {
        continue;
      }
      int hits = 0;
      for (Map<String, Object> row : siblings) {
        if (clues(row).contains(clue)) {
          hits++;
        }
      }
      if (hits == 1) {
        return true;
      }
    }
    return false;
  }

  private static List<String> clues(Map<String, Object> row) {
    List<String> out = new ArrayList<>();
    add(out, str(row.get("spaceName")));
    add(out, str(row.get("locationName")));
    String note = str(row.get("note"));
    add(out, note);
    int max = Math.min(note.length(), 8);
    for (int len = 2; len <= max; len++) {
      for (int i = 0; i + len <= note.length(); i++) {
        add(out, note.substring(i, i + len));
      }
    }
    return out;
  }

  private static void add(List<String> out, String text) {
    if (text != null && text.length() >= 2 && !out.contains(text)) {
      out.add(text);
    }
  }

  private static String targetName(List<Map<String, Object>> rows, Map<String, Object> call) {
    Map<String, Object> row = findRow(rows, call);
    if (row != null && !str(row.get("name")).isEmpty()) {
      return str(row.get("name"));
    }
    return str(call.get("name"));
  }

  private static Map<String, Object> findRow(List<Map<String, Object>> rows, Map<String, Object> call) {
    String ref = ActRefs.pickCallRef(call);
    if (!ref.isEmpty()) {
      for (Map<String, Object> row : rows) {
        if (ref.equalsIgnoreCase(str(row.get("ref")))) {
          return row;
        }
      }
    }
    String itemId = str(call.get("itemId"));
    if (!itemId.isEmpty()) {
      for (Map<String, Object> row : rows) {
        if (itemId.equals(str(row.get("itemId")))) {
          return row;
        }
      }
    }
    String name = str(call.get("name"));
    Map<String, Object> only = null;
    for (Map<String, Object> row : rows) {
      if (!name.isEmpty() && name.equals(str(row.get("name")))) {
        if (only != null) {
          return null;
        }
        only = row;
      }
    }
    return only;
  }

  private static List<Map<String, Object>> dedupe(List<Map<String, Object>> rows) {
    LinkedHashMap<String, Map<String, Object>> byId = new LinkedHashMap<>();
    if (rows == null) {
      return List.of();
    }
    int n = 0;
    for (Map<String, Object> row : rows) {
      if (row == null) {
        continue;
      }
      String id = str(row.get("itemId"));
      if (id.isEmpty()) {
        id = "#" + n;
      }
      n++;
      byId.putIfAbsent(id, row);
    }
    return new ArrayList<>(byId.values());
  }

  static boolean mentioned(String userText, BigDecimal number) {
    if (userText == null || number == null) {
      return false;
    }
    BigDecimal abs = number.abs().stripTrailingZeros();
    String plain = abs.toPlainString();
    if (containsNumber(userText, plain)) {
      return true;
    }
    if (abs.compareTo(new BigDecimal("0.5")) == 0) {
      return userText.contains("半");
    }
    if (abs.scale() > 0) {
      return false;
    }
    int value = abs.intValue();
    if (value == 2 && (userText.contains("两") || userText.contains("二"))) {
      return true;
    }
    String cn =
        switch (value) {
          case 1 -> "一";
          case 2 -> "两";
          case 3 -> "三";
          case 4 -> "四";
          case 5 -> "五";
          case 6 -> "六";
          case 7 -> "七";
          case 8 -> "八";
          case 9 -> "九";
          case 10 -> "十";
          default -> "";
        };
    if (cn.isEmpty() || !userText.contains(cn)) {
      return false;
    }
    if (value == 1) {
      return userText.replace("一半", "").contains("一");
    }
    return true;
  }

  private static boolean containsNumber(String text, String plain) {
    int from = 0;
    while (from < text.length()) {
      int at = text.indexOf(plain, from);
      if (at < 0) {
        return false;
      }
      boolean before = at > 0 && isNumChar(text.charAt(at - 1));
      int end = at + plain.length();
      boolean after = end < text.length() && isNumChar(text.charAt(end));
      if (!before && !after) {
        return true;
      }
      from = at + 1;
    }
    return false;
  }

  private static boolean isNumChar(char c) {
    return (c >= '0' && c <= '9') || c == '.';
  }

  private static BigDecimal decimal(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof BigDecimal decimal) {
      return decimal.stripTrailingZeros();
    }
    if (value instanceof Number number) {
      return new BigDecimal(number.toString()).stripTrailingZeros();
    }
    String text = str(value);
    if (text.isEmpty()) {
      return null;
    }
    try {
      return new BigDecimal(text).stripTrailingZeros();
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static boolean filled(Object value) {
    return value != null && !str(value).isEmpty();
  }

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }

  /** BigDecimal → 去掉尾随零的 plain 字符串，null 返回空串。 */
  private static String plain(BigDecimal value) {
    if (value == null) {
      return "";
    }
    return value.stripTrailingZeros().toPlainString();
  }

  /** 返回 call 指向的行集合：单删返回 ref/itemId/name 匹配的那一条；批量删返回同名所有行。 */
  private static List<Map<String, Object>> targetRows(
      List<Map<String, Object>> rows, Map<String, Object> call) {
    String ref = ActRefs.pickCallRef(call);
    String itemId = str(call.get("itemId"));
    String name = str(call.get("name"));
    List<Map<String, Object>> matched = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      if (!ref.isEmpty() && ref.equalsIgnoreCase(str(row.get("ref")))) {
        matched.add(row);
        continue;
      }
      if (!itemId.isEmpty() && itemId.equals(str(row.get("itemId")))) {
        matched.add(row);
        continue;
      }
      if (!name.isEmpty() && name.equals(str(row.get("name")))) {
        matched.add(row);
      }
    }
    return matched;
  }

  /**
   * 从用户文本中提取物品名附近出现的所有数量（阿拉伯数字 + 常用中文数字）。
   * 用户没提数量或解析失败时返回空列表，调用方会放行。
   */
  private static List<BigDecimal> quantitiesNear(String userText, String name) {
    List<BigDecimal> result = new ArrayList<>();
    if (userText == null || userText.isEmpty()) {
      return result;
    }
    // 全文阿拉伯数字
    Matcher m = Pattern.compile("\\d+(\\.\\d+)?").matcher(userText);
    while (m.find()) {
      try {
        BigDecimal n = new BigDecimal(m.group()).stripTrailingZeros();
        result.add(n);
      } catch (NumberFormatException ignored) {
      }
    }
    // 半 → 0.5
    if (userText.contains("半")) {
      result.add(new BigDecimal("0.5"));
    }
    // 中文数字（只匹配独立出现，避免把物品名里的"一""二"算进去）
    // 先尝试"X个""X盒"等量化词的量词前 X
    String[] cnDigits = {"零", "一", "两", "二", "三", "四", "五", "六", "七", "八", "九", "十"};
    int[] values = {0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    for (int i = 0; i < cnDigits.length; i++) {
      String token = cnDigits[i];
      if (!userText.contains(token)) {
        continue;
      }
      // 简单判定：该中文数字后面紧跟"个/盒/瓶/包/袋/只/支/张/本/把/件/箱/盒"之一
      // 或者它是"每X"、"X件"的一部分
      int from = 0;
      while (true) {
        int at = userText.indexOf(token, from);
        if (at < 0) {
          break;
        }
        int end = at + token.length();
        boolean followedByQuantifier =
            end < userText.length() && "个盒瓶包袋只支张本把件箱次套片块颗根".indexOf(userText.charAt(end)) >= 0;
        if (followedByQuantifier) {
          result.add(new BigDecimal(values[i]));
        }
        from = end;
      }
    }
    // 去重保持顺序
    List<BigDecimal> deduped = new ArrayList<>();
    for (BigDecimal n : result) {
      boolean already = false;
      for (BigDecimal exist : deduped) {
        if (exist.compareTo(n) == 0) {
          already = true;
          break;
        }
      }
      if (!already) {
        deduped.add(n);
      }
    }
    return deduped;
  }
}
