package com.homestocker.modules.ai.agent;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 改现有物资时只核对机器事实：同名几条却没指明哪条、整条删除与库存行数对不上。
 * 落点与数量的来源由 {@link Provenance} 按申报核验，这里不比对句子用词。
 */
public final class WriteGrounding {

  private WriteGrounding() {}

  public static ToolFeedback check(
      String userText, List<Map<String, Object>> rows, Map<String, Object> call) {
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
    ToolFeedback same = sameName(userText, pool, call);
    if (same != null) {
      return same;
    }
    return removeMismatch(userText, pool, call);
  }

  static ToolFeedback sameName(
      String userText, List<Map<String, Object>> rows, Map<String, Object> call) {
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
    // itemId 来自回执/查询的机器事实，比短号更硬，直接放行。
    String itemId = str(call.get("itemId"));
    if (!itemId.isEmpty() && hits(rows, "itemId", itemId)) {
      return null;
    }
    Map<String, Object> target = findRow(rows, call);
    // 本句里有区分线索，或这次调用自己点名了落点/备注/日期（且同级里唯一），才算点明是哪一条。
    // 只给短号不够：模型从本轮几行里随手挑一条，家人其实没说是哪条。
    if (target != null
        && (uniquely(userText, target, siblings) || narrowedByCall(call, target, siblings))) {
      return null;
    }
    List<String> candidates = new ArrayList<>();
    for (Map<String, Object> sibling : siblings) {
      candidates.add(summary(sibling));
    }
    return ToolFeedback.of(GroundingCodes.REF_AMBIGUOUS, "name", name).withCandidates(candidates);
  }

  /** 调用自己点名了落点/备注/日期，且同级里只有这一条符合，说明确实指定了是哪条。 */
  private static boolean narrowedByCall(
      Map<String, Object> call, Map<String, Object> target, List<Map<String, Object>> siblings) {
    for (String key : List.of("spaceName", "locationName", "note", "productionDate", "expireDate")) {
      String want = str(call.get(key));
      if (want.isEmpty() || !want.equals(str(target.get(key)))) {
        continue;
      }
      int hits = 0;
      for (Map<String, Object> sibling : siblings) {
        if (want.equals(str(sibling.get(key)))) {
          hits++;
        }
      }
      if (hits == 1) {
        return true;
      }
    }
    return false;
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


  /**
   * 整条删除只对应「现有这么多、这句话也是这么多」或没写数量。
   * 名称旁边的数量比库存大，或对不上现有数量时，不删。返回给家人的问句。
   */
  public static ToolFeedback removeMismatch(
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
      List<BigDecimal> stated = quantitiesNear(userText, str(row.get("name")), rows);
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
      BigDecimal shown = larger != null ? larger : other;
      return ToolFeedback.of(
              GroundingCodes.QTY_UNGROUNDED, "quantity", shown == null ? "" : plain(shown))
          .withCandidates(List.of(summary(row)));
    }
    return null;
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


  /** 回执候选行：`P1 酱油 1瓶 厨房/橱柜`。 */
  static String summary(Map<String, Object> row) {
    if (row == null) {
      return "";
    }
    StringBuilder sb = new StringBuilder();
    String ref = str(row.get("ref"));
    if (!ref.isEmpty()) {
      sb.append(ref).append(' ');
    }
    sb.append(str(row.get("name")));
    String qty = plain(decimal(row.get("quantity")));
    if (!qty.isEmpty()) {
      sb.append(' ').append(qty).append(str(row.get("unit")));
    }
    String space = str(row.get("spaceName"));
    if (!space.isEmpty()) {
      sb.append(' ').append(space);
      String loc = str(row.get("locationName"));
      if (!loc.isEmpty()) {
        sb.append('/').append(loc);
      }
    }
    return sb.toString().trim();
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
   * 取被删物品名所在分句里的数量（阿拉伯数字 + 常用中文数字）。
   * 同一句里别的对象带的数字不算（「苹果改成3，再把电脑删掉」的 3 归苹果）；
   * 名称落在更长的别的物品名里也不算（「米」在「大米」里）。
   * 用户没提数量或解析失败时返回空列表，调用方会放行。
   */
  private static List<BigDecimal> quantitiesNear(
      String userText, String name, List<Map<String, Object>> rows) {
    List<BigDecimal> result = new ArrayList<>();
    if (userText == null || userText.isEmpty() || name == null || name.isEmpty()) {
      return result;
    }
    List<int[]> clauses = clauseRanges(userText);
    List<String> longerNames = longerNames(rows, name);
    int from = 0;
    while (true) {
      int at = userText.indexOf(name, from);
      if (at < 0) {
        break;
      }
      int end = at + name.length();
      from = end;
      if (insideLongerName(userText, at, end, longerNames)) {
        continue;
      }
      int[] clause = clauseAt(clauses, at);
      result.addAll(numbersIn(userText.substring(clause[0], clause[1])));
    }
    return distinct(result);
  }

  /** 文本里出现过的、比 name 更长且包含 name 的物品名。 */
  private static List<String> longerNames(List<Map<String, Object>> rows, String name) {
    List<String> out = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      String other = str(row.get("name"));
      if (other.length() > name.length() && other.contains(name) && !out.contains(other)) {
        out.add(other);
      }
    }
    return out;
  }

  /** 名称这次出现在哪个更长的物品名里，就不算在说这一条。 */
  private static boolean insideLongerName(
      String text, int start, int end, List<String> longerNames) {
    for (String longer : longerNames) {
      int from = 0;
      while (true) {
        int at = text.indexOf(longer, from);
        if (at < 0) {
          break;
        }
        if (at <= start && at + longer.length() >= end) {
          return true;
        }
        from = at + 1;
      }
    }
    return false;
  }

  /** 按中文/英文标点切句，返回每句的 [起, 止) 下标。 */
  private static List<int[]> clauseRanges(String text) {
    List<int[]> out = new ArrayList<>();
    int start = 0;
    for (int i = 0; i < text.length(); i++) {
      if ("，。；;,.!！?？、\n".indexOf(text.charAt(i)) >= 0) {
        out.add(new int[] {start, i});
        start = i + 1;
      }
    }
    out.add(new int[] {start, text.length()});
    return out;
  }

  private static int[] clauseAt(List<int[]> clauses, int index) {
    for (int[] clause : clauses) {
      if (index >= clause[0] && index < clause[1]) {
        return clause;
      }
    }
    int[] last = clauses.get(clauses.size() - 1);
    return last;
  }

  /** 一段话里的数量：阿拉伯数字、"半"、以及带量词的中文数字。 */
  private static List<BigDecimal> numbersIn(String text) {
    List<BigDecimal> result = new ArrayList<>();
    Matcher m = Pattern.compile("\\d+(\\.\\d+)?").matcher(text);
    while (m.find()) {
      try {
        BigDecimal n = new BigDecimal(m.group()).stripTrailingZeros();
        result.add(n);
      } catch (NumberFormatException ignored) {
      }
    }
    if (text.contains("半")) {
      result.add(new BigDecimal("0.5"));
    }
    String[] cnDigits = {"零", "一", "两", "二", "三", "四", "五", "六", "七", "八", "九", "十"};
    int[] values = {0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    for (int i = 0; i < cnDigits.length; i++) {
      String token = cnDigits[i];
      if (!text.contains(token)) {
        continue;
      }
      // 简单判定：该中文数字后面紧跟"个/盒/瓶/包/袋/只/支/张/本/把/件/箱/盒"之一
      // 或者它是"每X"、"X件"的一部分
      int from = 0;
      while (true) {
        int at = text.indexOf(token, from);
        if (at < 0) {
          break;
        }
        int end = at + token.length();
        boolean followedByQuantifier =
            end < text.length()
                && "个盒瓶包袋只支张本把件箱次套片块颗根".indexOf(text.charAt(end)) >= 0;
        if (followedByQuantifier) {
          result.add(new BigDecimal(values[i]));
        }
        from = end;
      }
    }
    return result;
  }

  /** 去重保持顺序。 */
  private static List<BigDecimal> distinct(List<BigDecimal> values) {
    List<BigDecimal> deduped = new ArrayList<>();
    for (BigDecimal n : values) {
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
