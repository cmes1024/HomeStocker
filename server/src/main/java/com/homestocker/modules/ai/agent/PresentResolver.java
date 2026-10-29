package com.homestocker.modules.ai.agent;

import com.homestocker.common.ShanghaiDates;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Resolves model {@code present} into a client-safe structured view (table / stats / bars / pie).
 * Unknown types dropped; rows/items capped. Prefer {@code source: probe|inventory} over invented cells.
 */
public final class PresentResolver {

  public static final int MAX_ROWS = 40;
  public static final int MAX_COLS = 6;
  public static final int MAX_ITEMS = 12;
  /** 模型自定义表格最多几列（手机宽度；超出截断）。 */
  public static final int MAX_SPEC_COLS = 5;
  private static final int MAX_LABEL = 6;
  private static final int MAX_CELL = 24;
  private static final List<String> DEFAULT_COLS = List.of("名称", "数量", "位置");
  /** 「没写具体位置」这类空缺说明，不是这行的事实。 */
  private static final Pattern VACANT_CLAUSE =
      Pattern.compile("[，,、；;]?\\s*(?:没|未)(?:有)?(?:写|填|记录|标明|说明)[^，,。；;]*");
  private static final Pattern VACANT_PLACE =
      Pattern.compile("[，,、；;]?\\s*(?:无|没有|未知|暂无)[^，,。；;]{0,8}(?:位置|信息|记录|说明)");

  /** Fixed slice colors for bars/pie — no model-supplied colors. */
  private static final String[] PALETTE = {
    "#C4A484", "#7A9E7E", "#6B8CAE", "#C48B7A", "#9A8BB5", "#B5A06A",
    "#6A9B9B", "#A67C7C", "#8A9A6B", "#7A8BA8", "#B58A6A", "#8B7A9A"
  };

  private PresentResolver() {}

  @SuppressWarnings("unchecked")
  public static Map<String, Object> resolve(
      Map<String, Object> raw,
      List<Map<String, Object>> probeRows,
      Map<String, Object> inventoryReport) {
    if (raw == null || raw.isEmpty()) {
      return null;
    }
    String type = str(raw.get("type")).trim().toLowerCase(Locale.ROOT);
    if (type.isEmpty()) {
      return null;
    }
    String source = str(raw.get("source")).trim().toLowerCase(Locale.ROOT);
    List<Map<String, Object>> rowsFromSource = rowsFromSource(source, probeRows, inventoryReport);
    // 模型只画其中几行时给 refs：按本轮短号挑行；一个都没对上就忽略，退回本轮全部行。
    List<String> refs = refList(raw.get("refs"));
    boolean subset = false;
    if (!refs.isEmpty()) {
      List<Map<String, Object>> picked = byRefs(rowsFromSource, refs);
      if (!picked.isEmpty()) {
        rowsFromSource = picked;
        subset = true;
      }
    }
    String title = str(raw.get("title")).trim();
    String groupBy = str(raw.get("groupBy")).trim().toLowerCase(Locale.ROOT);

    return switch (type) {
      case "table" -> resolveTable(raw, rowsFromSource, title);
      case "stats", "stat", "bars", "bar", "pie", "donut" -> {
        boolean chart =
            "bars".equals(type) || "bar".equals(type) || "pie".equals(type) || "donut".equals(type);
        // 没指定分组、也没自带格子时，不把物资行收成空间。已查到的行按清单展示。
        if (!chart && groupBy.isEmpty() && itemList(raw.get("items")).isEmpty() && !rowsFromSource.isEmpty()) {
          yield resolveTable(Map.of(), rowsFromSource, title);
        }
        String view =
            "bars".equals(type) || "bar".equals(type)
                ? "bars"
                : "pie".equals(type) || "donut".equals(type) ? "pie" : "stats";
        yield resolveStatsOrBars(view, raw, rowsFromSource, inventoryReport, title, subset);
      }
      default -> null;
    };
  }

  /** 按短号挑行，保持 refs 给出的顺序；没对上任何一行就返回空。 */
  private static List<Map<String, Object>> byRefs(
      List<Map<String, Object>> rows, List<String> refs) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (String want : refs) {
      for (Map<String, Object> row : rows) {
        if (want.equalsIgnoreCase(str(row.get("ref")).trim())) {
          out.add(row);
          if (out.size() >= MAX_ROWS) {
            return out;
          }
          break;
        }
      }
    }
    return out;
  }

  private static Map<String, Object> resolveTable(
      Map<String, Object> raw, List<Map<String, Object>> sourceRows, String title) {
    List<Map<String, Object>> specCols = mapList(raw.get("columns"));
    if (specCols.isEmpty()) {
      specCols = stringSpecCols(raw.get("columns"));
    }
    List<List<String>> explicitRows = cellRows(raw.get("rows"));
    Map<String, String> notes = noteMap(raw.get("notes"));

    List<String> columns = new ArrayList<>();
    List<Integer> widths = new ArrayList<>();
    for (Map<String, Object> c : specCols) {
      String label = str(c.get("label")).trim();
      if (label.isEmpty()) {
        label = str(c.get("key")).trim();
      }
      if (label.isEmpty()) {
        continue;
      }
      columns.add(label.length() > MAX_LABEL ? label.substring(0, MAX_LABEL) : label);
      widths.add(colWidth(c.get("width")));
      if (columns.size() >= MAX_SPEC_COLS) {
        break;
      }
    }
    boolean custom = !columns.isEmpty();
    if (custom && specCols.size() != columns.size()) {
      specCols = new ArrayList<>(specCols.subList(0, columns.size()));
    }

    List<List<String>> rows = explicitRows;
    if (rows.isEmpty() && !sourceRows.isEmpty()) {
      if (!custom) {
        columns = new ArrayList<>(DEFAULT_COLS);
        widths = new ArrayList<>(List.of(2, 1, 2));
      }
      rows = new ArrayList<>();
      for (Map<String, Object> item : sourceRows) {
        if (rows.size() >= MAX_ROWS) {
          break;
        }
        rows.add(custom ? cellsForSpec(item, specCols, notes) : rowFromItem(item, columns));
      }
      if (custom) {
        rows = dropEmptyColumns(rows, columns, widths);
        if (rows.isEmpty()) {
          columns = new ArrayList<>(DEFAULT_COLS);
          widths = new ArrayList<>(List.of(2, 1, 2));
          rows = new ArrayList<>();
          for (Map<String, Object> item : sourceRows) {
            if (rows.size() >= MAX_ROWS) {
              break;
            }
            rows.add(rowFromItem(item, columns));
          }
        }
      }
    }
    if (columns.isEmpty() || rows.isEmpty()) {
      return null;
    }
    if (columns.size() > MAX_COLS) {
      columns = columns.subList(0, MAX_COLS);
    }
    List<List<String>> capped = new ArrayList<>();
    for (int i = 0; i < Math.min(MAX_ROWS, rows.size()); i++) {
      List<String> row = rows.get(i);
      List<String> cells = new ArrayList<>();
      for (int c = 0; c < columns.size(); c++) {
        cells.add(c < row.size() ? row.get(c) : "");
      }
      capped.add(cells);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("type", "table");
    if (!title.isEmpty()) {
      out.put("title", title);
    }
    out.put("columns", columns);
    if (widths.size() == columns.size()) {
      out.put("widths", widths);
    }
    out.put("rows", capped);
    String caption = str(raw.get("caption")).trim();
    if (!caption.isEmpty()) {
      out.put("caption", caption);
    }
    if (sourceRows.size() > capped.size()) {
      out.put("footer", "另有 " + (sourceRows.size() - capped.size()) + " 行未展开");
    }
    return out;
  }

  /** 模型指定列：字段列按 key 取库值，text 列取该行 ref 对应的说明文字。 */
  private static List<String> cellsForSpec(
      Map<String, Object> item, List<Map<String, Object>> specCols, Map<String, String> notes) {
    List<String> cells = new ArrayList<>();
    for (Map<String, Object> col : specCols) {
      if (Boolean.TRUE.equals(col.get("text"))) {
        cells.add("");
      } else {
        cells.add(cellForColumn(item, str(col.get("key"))));
      }
    }
    String ref = str(item.get("ref")).trim().toUpperCase(Locale.ROOT);
    String note = ref.isEmpty() ? "" : cleanNote(notes.getOrDefault(ref, ""));
    if (!note.isEmpty() && !noteRepeatsRow(note, specCols, cells)) {
      for (int i = 0; i < specCols.size(); i++) {
        if (Boolean.TRUE.equals(specCols.get(i).get("text"))) {
          cells.set(i, note);
        }
      }
    }
    return cells;
  }

  /** 去掉「没写具体位置」这类空缺说明，剩下的才是这行独有的事实。 */
  private static String cleanNote(String raw) {
    String s = str(raw).trim();
    if (s.isEmpty()) {
      return "";
    }
    s = VACANT_CLAUSE.matcher(s).replaceAll("");
    s = VACANT_PLACE.matcher(s).replaceAll("");
    s = s.replaceAll("^[，,、；;\\s]+", "").replaceAll("[，,、；;\\s]+$", "");
    String compact = s.replaceAll("[，,、。；;\\s]", "");
    if (compact.length() < 2 || compact.matches("(?:没写|未填|没有|暂无|无|未知)+")) {
      return "";
    }
    return s;
  }

  /** 说明列不复述同一行的字段值（位置、数量为主；名称只挡完全相等）。 */
  private static boolean noteRepeatsRow(
      String note, List<Map<String, Object>> specCols, List<String> cells) {
    String text = squeeze(note);
    for (int i = 0; i < specCols.size() && i < cells.size(); i++) {
      if (Boolean.TRUE.equals(specCols.get(i).get("text"))) {
        continue;
      }
      String key = str(specCols.get(i).get("key")).trim().toLowerCase(Locale.ROOT);
      String v = squeeze(cells.get(i));
      if (v.length() < 2) {
        continue;
      }
      if (text.equals(v) || (!"name".equals(key) && text.contains(v))) {
        return true;
      }
    }
    return false;
  }

  private static String squeeze(String raw) {
    return str(raw).replaceAll("[，,、。；;\\s]", "");
  }

  /** 整列全空就剔掉，避免模型给了列却没有内容。 */
  private static List<List<String>> dropEmptyColumns(
      List<List<String>> rows, List<String> columns, List<Integer> widths) {
    if (rows.isEmpty()) {
      return rows;
    }
    List<Integer> keep = new ArrayList<>();
    for (int c = 0; c < columns.size(); c++) {
      for (List<String> r : rows) {
        if (c < r.size() && !str(r.get(c)).isBlank()) {
          keep.add(c);
          break;
        }
      }
    }
    if (keep.size() == columns.size()) {
      return rows;
    }
    if (keep.isEmpty()) {
      return List.of();
    }
    List<String> newCols = new ArrayList<>();
    List<Integer> newWidths = new ArrayList<>();
    for (int c : keep) {
      newCols.add(columns.get(c));
      newWidths.add(widths.get(c));
    }
    columns.clear();
    columns.addAll(newCols);
    widths.clear();
    widths.addAll(newWidths);
    List<List<String>> out = new ArrayList<>();
    for (List<String> r : rows) {
      List<String> cells = new ArrayList<>();
      for (int c : keep) {
        cells.add(c < r.size() ? r.get(c) : "");
      }
      out.add(cells);
    }
    return out;
  }

  private static Map<String, String> noteMap(Object raw) {
    Map<String, String> out = new LinkedHashMap<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      if (!(o instanceof Map<?, ?> m)) {
        continue;
      }
      String ref = str(m.get("ref")).trim().toUpperCase(Locale.ROOT);
      String text = str(m.get("text")).trim();
      if (ref.isEmpty() || text.isEmpty()) {
        continue;
      }
      out.put(ref, text.length() <= MAX_CELL ? text : text.substring(0, MAX_CELL) + "…");
    }
    return out;
  }

  private static int colWidth(Object raw) {
    int v = (int) Math.round(toDouble(raw));
    return Math.min(5, Math.max(1, v));
  }

  /** 兼容旧的字符串列名数组：按中文字段名取值，没有说明列。 */
  private static List<Map<String, Object>> stringSpecCols(Object raw) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (String label : stringList(raw)) {
      Map<String, Object> col = new LinkedHashMap<>();
      col.put("label", label);
      col.put("key", label);
      col.put("text", false);
      col.put("width", 1);
      out.add(col);
      if (out.size() >= MAX_SPEC_COLS) {
        break;
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> mapList(Object raw) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      if (o instanceof Map<?, ?> m) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
          row.put(String.valueOf(e.getKey()), e.getValue());
        }
        out.add(row);
      }
      if (out.size() >= MAX_SPEC_COLS) {
        break;
      }
    }
    return out;
  }

  private static Map<String, Object> resolveStatsOrBars(
      String type,
      Map<String, Object> raw,
      List<Map<String, Object>> sourceRows,
      Map<String, Object> inventoryReport,
      String title,
      boolean subset) {
    List<Map<String, Object>> items = itemList(raw.get("items"));
    String groupBy = str(raw.get("groupBy")).trim().toLowerCase(Locale.ROOT);
    // item.stats 的桶是全库口径：先用它，别拿本轮顺手查到的几行冒充分布。
    // 只取与 groupBy 一致的桶；未写分组时不从空间桶补格子。
    if (!groupBy.isEmpty() && items.isEmpty() && !subset) {
      items = itemsFromStatsReport(inventoryReport, groupBy);
    }
    // 没有 stats 桶（或模型只画 refs 子集）时，才按本轮行数聚合。
    if (!groupBy.isEmpty() && items.isEmpty() && !sourceRows.isEmpty()) {
      items = aggregate(sourceRows, groupBy);
    }
    if (items.isEmpty()) {
      return null;
    }
    List<Map<String, Object>> cleaned = new ArrayList<>();
    for (Map<String, Object> it : items) {
      String label = str(it.get("label")).trim();
      if (label.isEmpty()) {
        continue;
      }
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("label", label);
      row.put("value", Math.max(0, toDouble(it.get("value"))));
      cleaned.add(row);
      if (cleaned.size() >= MAX_ITEMS) {
        break;
      }
    }
    if (cleaned.isEmpty()) {
      return null;
    }
    double max = 0;
    double sum = 0;
    for (Map<String, Object> it : cleaned) {
      double v = toDouble(it.get("value"));
      max = Math.max(max, v);
      sum += v;
    }
    int[] shares = sharesOfTotal(cleaned, sum);
    List<Map<String, Object>> view = new ArrayList<>();
    for (int i = 0; i < cleaned.size(); i++) {
      Map<String, Object> it = cleaned.get(i);
      Map<String, Object> row = new LinkedHashMap<>();
      double value = toDouble(it.get("value"));
      row.put("label", it.get("label"));
      row.put("value", stripNumber(value));
      int pct = max <= 0 ? 0 : (int) Math.round(100.0 * value / max);
      row.put("pct", Math.max(0, Math.min(100, pct)));
      row.put("share", shares[i]);
      row.put("color", PALETTE[i % PALETTE.length]);
      view.add(row);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("type", type);
    if (!title.isEmpty()) {
      out.put("title", title);
    }
    out.put("items", view);
    if ("pie".equals(type)) {
      String pieCss = buildPieCss(view);
      if (!pieCss.isEmpty()) {
        out.put("pieCss", pieCss);
      }
    }
    return out;
  }

  /** Largest-remainder shares that sum to 100 (or 0 if total is empty). */
  private static int[] sharesOfTotal(List<Map<String, Object>> items, double sum) {
    int n = items.size();
    int[] shares = new int[n];
    if (n == 0 || sum <= 0) {
      return shares;
    }
    double[] exact = new double[n];
    int assigned = 0;
    for (int i = 0; i < n; i++) {
      exact[i] = 100.0 * Math.max(0, toDouble(items.get(i).get("value"))) / sum;
      shares[i] = (int) Math.floor(exact[i]);
      assigned += shares[i];
    }
    int remain = 100 - assigned;
    Integer[] order = new Integer[n];
    for (int i = 0; i < n; i++) {
      order[i] = i;
    }
    java.util.Arrays.sort(
        order, (a, b) -> Double.compare(exact[b] - shares[b], exact[a] - shares[a]));
    for (int k = 0; k < remain; k++) {
      shares[order[k % n]]++;
    }
    return shares;
  }

  private static String buildPieCss(List<Map<String, Object>> view) {
    if (view.isEmpty()) {
      return "";
    }
    List<String> parts = new ArrayList<>();
    int cursor = 0;
    for (Map<String, Object> it : view) {
      int share = ((Number) it.get("share")).intValue();
      if (share <= 0) {
        continue;
      }
      String color = str(it.get("color"));
      int end = Math.min(100, cursor + share);
      parts.add(color + " " + cursor + "% " + end + "%");
      cursor = end;
    }
    if (parts.isEmpty()) {
      return "";
    }
    if (cursor < 100) {
      parts.add("rgba(26,26,26,0.06) " + cursor + "% 100%");
    }
    return "conic-gradient(" + String.join(", ", parts) + ")";
  }

  /**
   * item.stats 写入 report.executed[].stats.buckets，不是 inventory 行列表。
   * 模型常交 present type=stats + source=inventory，须从 buckets 还原 items。
   */
  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> itemsFromStatsReport(
      Map<String, Object> report, String preferredGroupBy) {
    if (report == null || !(report.get("executed") instanceof List<?> executed)) {
      return List.of();
    }
    for (Object rowObj : executed) {
      if (!(rowObj instanceof Map<?, ?> row)) {
        continue;
      }
      Object statsObj = row.get("stats");
      if (!(statsObj instanceof Map<?, ?>)) {
        continue;
      }
      Map<String, Object> stats = (Map<String, Object>) statsObj;
      String groupBy = str(stats.get("groupBy")).trim().toLowerCase(Locale.ROOT);
      List<Map<String, Object>> buckets =
          stats.get("buckets") instanceof List<?> b
              ? (List<Map<String, Object>>) b
              : List.of();
      if (buckets.isEmpty()) {
        continue;
      }
      List<Map<String, Object>> items = new ArrayList<>();
      for (Map<String, Object> bucket : buckets) {
        if (bucket == null) {
          continue;
        }
        String label = str(bucket.get("label")).trim();
        if (label.isEmpty()) {
          continue;
        }
        Map<String, Object> one = new LinkedHashMap<>();
        one.put("label", label);
        one.put("value", bucket.get("value"));
        items.add(one);
        if (items.size() >= MAX_ITEMS) {
          break;
        }
      }
      if (items.isEmpty()) {
        continue;
      }
      if (preferredGroupBy.equals(groupBy)) {
        return items;
      }
    }
    return List.of();
  }

  /**
   * 按桶数记录数，不按数量求和：一件 5 斤大米和一件 1 瓶酱油相加没有意义，
   * 也和 {@code item.stats} 的口径对不上（同一个「各空间多少」不该出现两种数）。
   */
  private static List<Map<String, Object>> aggregate(
      List<Map<String, Object>> sourceRows, String groupBy) {
    Map<String, Integer> counts = new LinkedHashMap<>();
    for (Map<String, Object> item : sourceRows) {
      String key;
      if ("location".equals(groupBy) || "place".equals(groupBy)) {
        key = placeLabel(item);
      } else if ("name".equals(groupBy)) {
        key = str(item.get("name")).trim();
        if (key.isEmpty()) {
          key = "未命名";
        }
      } else {
        key = str(item.get("spaceName")).trim();
        if (key.isEmpty()) {
          key = "未分组";
        }
      }
      counts.merge(key, 1, Integer::sum);
    }
    List<Map<String, Object>> items = new ArrayList<>();
    for (Map.Entry<String, Integer> e : counts.entrySet()) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("label", e.getKey());
      row.put("value", e.getValue());
      items.add(row);
      if (items.size() >= MAX_ITEMS) {
        break;
      }
    }
    return items;
  }

  private static List<Map<String, Object>> rowsFromSource(
      String source, List<Map<String, Object>> probeRows, Map<String, Object> inventoryReport) {
    List<Map<String, Object>> probe = probeRows != null ? probeRows : List.of();
    if ("probe".equals(source) || "p".equals(source)) {
      return probe;
    }
    if ("inventory".equals(source) || "inv".equals(source) || "search".equals(source)) {
      List<Map<String, Object>> fromReport = inventoryRows(inventoryReport);
      if (!fromReport.isEmpty()) {
        return fromReport;
      }
      return probe;
    }
    // 未写 source：有本轮事实就用，避免 stats/table 空解析
    if (source.isEmpty()) {
      List<Map<String, Object>> fromReport = inventoryRows(inventoryReport);
      if (!fromReport.isEmpty()) {
        return fromReport;
      }
      return probe;
    }
    return List.of();
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> inventoryRows(Map<String, Object> report) {
    if (report == null || !(report.get("executed") instanceof List<?> executed)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object rowObj : executed) {
      if (!(rowObj instanceof Map<?, ?> row) || !(row.get("inventory") instanceof List<?> inv)) {
        continue;
      }
      for (Object itemObj : inv) {
        if (itemObj instanceof Map<?, ?> m) {
          out.add((Map<String, Object>) m);
        }
        if (out.size() >= MAX_ROWS) {
          return out;
        }
      }
    }
    return out;
  }

  private static List<String> rowFromItem(Map<String, Object> item, List<String> columns) {
    List<String> cells = new ArrayList<>();
    for (String col : columns) {
      cells.add(cellForColumn(item, col));
    }
    return cells;
  }

  private static String cellForColumn(Map<String, Object> item, String col) {
    String c = col == null ? "" : col.trim();
    String key = c.toLowerCase(Locale.ROOT);
    if (key.contains("名") || key.equals("name")) {
      return str(item.get("name"));
    }
    if (key.contains("数量") || key.contains("qty") || key.equals("quantity")) {
      return str(item.get("quantity")) + str(item.get("unit"));
    }
    if (key.contains("位置") || key.contains("地点") || key.contains("place") || key.contains("location")) {
      return placeLabel(item);
    }
    if (key.contains("空间") || key.equals("space")) {
      return str(item.get("spaceName"));
    }
    if (key.contains("过期") || key.contains("expire")) {
      return expireLabel(str(item.get("expireDate")), ShanghaiDates.todayLocalDate());
    }
    if (key.contains("生产") || key.contains("production")) {
      return str(item.get("productionDate"));
    }
    if (key.contains("备注") || key.equals("note")) {
      return str(item.get("note"));
    }
    return "";
  }

  /** 过期只给状态，不给日期：已过期 N 天 / 今日到期 / 快过期 N 天 / 空。 */
  static String expireLabel(String raw, LocalDate today) {
    String text = str(raw).trim();
    if (text.isEmpty() || today == null) {
      return "";
    }
    String ymd = text.length() > 10 ? text.substring(0, 10) : text;
    LocalDate date;
    try {
      date = LocalDate.parse(ymd);
    } catch (DateTimeParseException e) {
      return "";
    }
    long days = ChronoUnit.DAYS.between(today, date);
    if (days < 0) {
      return "已过期 " + (-days) + " 天";
    }
    if (days == 0) {
      return "今日到期";
    }
    if (days <= 3) {
      return "快过期 " + days + " 天";
    }
    return "";
  }

  private static String placeLabel(Map<String, Object> item) {
    return TreeMatch.placeLabel(str(item.get("spaceName")), str(item.get("locationName")));
  }

  /** refs 上限按行数算（表格最多 {@link #MAX_ROWS} 行），不按列数。 */
  private static List<String> refList(Object raw) {
    List<String> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      String s = str(o).trim().toUpperCase(Locale.ROOT);
      if (!s.isEmpty() && !out.contains(s)) {
        out.add(s);
      }
      if (out.size() >= MAX_ROWS) {
        break;
      }
    }
    return out;
  }

  private static List<String> stringList(Object raw) {
    List<String> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      String s = str(o).trim();
      if (!s.isEmpty()) {
        out.add(s);
      }
      if (out.size() >= MAX_COLS) {
        break;
      }
    }
    return out;
  }

  private static List<List<String>> cellRows(Object raw) {
    List<List<String>> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object rowObj : list) {
      if (!(rowObj instanceof List<?> cells)) {
        continue;
      }
      List<String> row = new ArrayList<>();
      for (Object c : cells) {
        row.add(str(c).trim());
        if (row.size() >= MAX_COLS) {
          break;
        }
      }
      if (!row.isEmpty()) {
        out.add(row);
      }
      if (out.size() >= MAX_ROWS) {
        break;
      }
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> itemList(Object raw) {
    List<Map<String, Object>> out = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return out;
    }
    for (Object o : list) {
      if (!(o instanceof Map<?, ?> m)) {
        continue;
      }
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("label", m.get("label") != null ? m.get("label") : m.get("name"));
      row.put("value", m.get("value") != null ? m.get("value") : m.get("count"));
      out.add(row);
      if (out.size() >= MAX_ITEMS) {
        break;
      }
    }
    return out;
  }

  private static double toDouble(Object raw) {
    if (raw == null) {
      return 0;
    }
    if (raw instanceof Number n) {
      return n.doubleValue();
    }
    try {
      return new BigDecimal(String.valueOf(raw).trim()).doubleValue();
    } catch (Exception e) {
      return 0;
    }
  }

  private static Object stripNumber(double v) {
    if (Math.abs(v - Math.rint(v)) < 1e-9) {
      return (long) Math.rint(v);
    }
    return BigDecimal.valueOf(v).stripTrailingZeros();
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
