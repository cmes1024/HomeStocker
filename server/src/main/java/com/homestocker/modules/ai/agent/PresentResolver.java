package com.homestocker.modules.ai.agent;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Resolves model {@code present} into a client-safe structured view (table / stats / bars).
 * Unknown types dropped; rows/items capped. Prefer {@code source: probe|inventory} over invented cells.
 */
public final class PresentResolver {

  public static final int MAX_ROWS = 40;
  public static final int MAX_COLS = 6;
  public static final int MAX_ITEMS = 12;

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
      case "stats", "stat" -> resolveStatsOrBars("stats", raw, rowsFromSource, title);
      case "bars", "bar" -> resolveStatsOrBars("bars", raw, rowsFromSource, title);
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
      String type, Map<String, Object> raw, List<Map<String, Object>> sourceRows, String title) {
    List<Map<String, Object>> items = itemList(raw.get("items"));
    if (items.isEmpty() && !sourceRows.isEmpty()) {
      String groupBy = str(raw.get("groupBy")).trim().toLowerCase(Locale.ROOT);
      if (groupBy.isEmpty()) {
        groupBy = "space";
      }
      items = aggregate(sourceRows, groupBy);
    }
    if (items.isEmpty()) {
      return null;
    }
    if (items.size() > MAX_ITEMS) {
      items = items.subList(0, MAX_ITEMS);
    }
    double max = 0;
    for (Map<String, Object> it : items) {
      max = Math.max(max, toDouble(it.get("value")));
    }
    List<Map<String, Object>> view = new ArrayList<>();
    for (Map<String, Object> it : items) {
      Map<String, Object> row = new LinkedHashMap<>();
      String label = str(it.get("label")).trim();
      if (label.isEmpty()) {
        continue;
      }
      double value = toDouble(it.get("value"));
      row.put("label", label);
      row.put("value", stripNumber(value));
      int pct = max <= 0 ? 0 : (int) Math.round(100.0 * value / max);
      row.put("pct", Math.max(0, Math.min(100, pct)));
      view.add(row);
    }
    if (view.isEmpty()) {
      return null;
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("type", type);
    if (!title.isEmpty()) {
      out.put("title", title);
    }
    out.put("items", view);
    return out;
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
