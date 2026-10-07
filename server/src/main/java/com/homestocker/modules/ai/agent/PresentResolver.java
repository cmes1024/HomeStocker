package com.homestocker.modules.ai.agent;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Resolves model {@code present} into a client-safe structured view (table / stats / bars / pie).
 * Unknown types dropped; rows/items capped. Prefer {@code source: probe|inventory} over invented cells.
 */
public final class PresentResolver {

  public static final int MAX_ROWS = 40;
  public static final int MAX_COLS = 6;
  public static final int MAX_ITEMS = 12;

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
    String title = str(raw.get("title")).trim();

    return switch (type) {
      case "table" -> resolveTable(raw, rowsFromSource, title);
      case "stats", "stat" -> resolveStatsOrBars("stats", raw, rowsFromSource, inventoryReport, title);
      case "bars", "bar" -> resolveStatsOrBars("bars", raw, rowsFromSource, inventoryReport, title);
      case "pie", "donut" -> resolveStatsOrBars("pie", raw, rowsFromSource, inventoryReport, title);
      default -> null;
    };
  }

  private static Map<String, Object> resolveTable(
      Map<String, Object> raw, List<Map<String, Object>> sourceRows, String title) {
    List<String> columns = stringList(raw.get("columns"));
    List<List<String>> rows = cellRows(raw.get("rows"));
    if (rows.isEmpty() && !sourceRows.isEmpty()) {
      if (columns.isEmpty()) {
        columns = List.of("名称", "数量", "位置");
      }
      rows = new ArrayList<>();
      for (Map<String, Object> item : sourceRows) {
        if (rows.size() >= MAX_ROWS) {
          break;
        }
        rows.add(rowFromItem(item, columns));
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
    out.put("rows", capped);
    if (sourceRows.size() > capped.size()) {
      out.put("footer", "另有 " + (sourceRows.size() - capped.size()) + " 行未展开");
    }
    return out;
  }

  private static Map<String, Object> resolveStatsOrBars(
      String type,
      Map<String, Object> raw,
      List<Map<String, Object>> sourceRows,
      Map<String, Object> inventoryReport,
      String title) {
    List<Map<String, Object>> items = itemList(raw.get("items"));
    String groupBy = str(raw.get("groupBy")).trim().toLowerCase(Locale.ROOT);
    if (groupBy.isEmpty()) {
      groupBy = "space";
    }
    if (items.isEmpty() && !sourceRows.isEmpty()) {
      items = aggregate(sourceRows, groupBy);
    }
    // item.stats 回执在 stats.buckets，没有 inventory 行；source=inventory 时仍要能画出分布卡
    if (items.isEmpty()) {
      items = itemsFromStatsReport(inventoryReport, groupBy);
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
    List<Map<String, Object>> best = List.of();
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
      if (!preferredGroupBy.isEmpty() && preferredGroupBy.equals(groupBy)) {
        return items;
      }
      if ("space".equals(groupBy) || "tag".equals(groupBy)) {
        return items;
      }
      best = items;
    }
    return best;
  }

  private static List<Map<String, Object>> aggregate(
      List<Map<String, Object>> sourceRows, String groupBy) {
    Map<String, Double> sums = new LinkedHashMap<>();
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
      double qty = toDouble(item.get("quantity"));
      if (qty <= 0) {
        qty = 1;
      }
      sums.merge(key, qty, Double::sum);
    }
    List<Map<String, Object>> items = new ArrayList<>();
    for (Map.Entry<String, Double> e : sums.entrySet()) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("label", e.getKey());
      row.put("value", stripNumber(e.getValue()));
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
      return str(item.get("expireDate"));
    }
    if (key.contains("备注") || key.equals("note")) {
      return str(item.get("note"));
    }
    return "";
  }

  private static String placeLabel(Map<String, Object> item) {
    return TreeMatch.placeLabel(str(item.get("spaceName")), str(item.get("locationName")));
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
