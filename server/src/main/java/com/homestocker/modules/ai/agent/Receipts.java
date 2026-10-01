package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of agent/receipts.js — parses assistant receipt text, not user NL routing. */
public final class Receipts {

  private static final Pattern QTY_RECEIPT =
      Pattern.compile(
          "已改\\s+([^\\n：:(（]+?)(?:\\s*[（(]([^）)]+)[）)])?\\s*[：:\\s]+([^\\s→\\-,，；;]+)\\s*→\\s*([^\\s\\n，,；;]+)");

  private Receipts() {}

  public record QtyReceipt(
      String name,
      String place,
      String spaceName,
      String locationName,
      String before,
      String after,
      double beforeNum,
      double afterNum) {}

  public static List<QtyReceipt> parseQtyChangeReceiptsFromText(String text) {
    String raw = str(text);
    if (raw.isEmpty() || !raw.contains("已改") || !raw.contains("→")) {
      return List.of();
    }
    List<QtyReceipt> out = new ArrayList<>();
    java.util.Set<String> seen = new java.util.LinkedHashSet<>();
    Matcher m = QTY_RECEIPT.matcher(raw);
    while (m.find()) {
      String name = m.group(1).trim();
      String place = m.group(2) != null ? m.group(2).trim() : "";
      String before = m.group(3).trim();
      String after = m.group(4).trim();
      if (name.isEmpty() || before.isEmpty() || after.isEmpty()) {
        continue;
      }
      String key = name + "|" + place + "|" + before + "|" + after;
      if (!seen.add(key)) {
        continue;
      }
      String[] parts = place.split("[/／]");
      String spaceName = parts.length > 0 ? parts[0] : "";
      String locationName = parts.length > 1 ? String.join("/", java.util.Arrays.copyOfRange(parts, 1, parts.length)) : "";
      out.add(
          new QtyReceipt(
              name,
              place,
              spaceName,
              locationName,
              before,
              after,
              parseDouble(before),
              parseDouble(after)));
    }
    return out;
  }

  public static List<QtyReceipt> parseLatestQtyChangeReceipts(List<Map<String, String>> history) {
    if (history == null) {
      return List.of();
    }
    for (int i = history.size() - 1; i >= 0; i--) {
      Map<String, String> row = history.get(i);
      if (row == null || !"assistant".equals(row.get("role"))) {
        continue;
      }
      List<QtyReceipt> hits = parseQtyChangeReceiptsFromText(row.get("text"));
      if (!hits.isEmpty()) {
        return hits;
      }
    }
    return List.of();
  }

  public static Map<String, Object> probeFromReceipts(List<QtyReceipt> receipts) {
    if (receipts == null || receipts.isEmpty()) {
      return Map.of("listAll", true);
    }
    List<String> names = new ArrayList<>();
    for (QtyReceipt r : receipts) {
      String n = r.name().trim();
      if (!n.isEmpty() && !names.contains(n)) {
        names.add(n);
      }
    }
    if (names.isEmpty()) {
      return Map.of("listAll", true);
    }
    if (names.size() == 1) {
      QtyReceipt row = receipts.get(0);
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("name", names.get(0));
      m.put("spaceName", row.spaceName().trim());
      m.put("locationName", row.locationName().trim());
      return m;
    }
    List<String> spaces = new ArrayList<>();
    for (QtyReceipt r : receipts) {
      String s = r.spaceName().trim();
      if (!s.isEmpty() && !spaces.contains(s)) {
        spaces.add(s);
      }
    }
    if (spaces.size() == 1) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("names", names);
      m.put("spaceName", spaces.get(0));
      return m;
    }
    return Map.of("names", names);
  }

  public static boolean callCoversReceipt(
      Map<String, Object> call, QtyReceipt receipt, Map<String, Map<String, Object>> refs) {
    if (call == null || receipt == null) {
      return false;
    }
    if (!"item.update".equals(str(call.get("use")).trim())) {
      return false;
    }
    if (!call.containsKey("quantity")) {
      return false;
    }
    String name = str(call.get("name")).trim();
    if (refs != null) {
      for (Map<String, Object> r : refs.values()) {
        if (r != null
            && (str(r.get("ref")).equals(str(call.get("ref")))
                || str(r.get("itemId")).equals(str(call.get("itemId"))))) {
          name = str(r.get("name")).trim();
          break;
        }
      }
    }
    if (!receipt.name().equals(name)) {
      return false;
    }
    return qtyEquals(call.get("quantity"), receipt.before())
        || qtyEquals(call.get("quantity"), receipt.beforeNum());
  }

  public static PlanParser.ActPlan completePartialReceiptRollbacks(
      PlanParser.ActPlan plan,
      List<QtyReceipt> receipts,
      Map<String, Map<String, Object>> refs,
      List<Map<String, Object>> probedRows,
      String userText) {
    if (plan == null || receipts == null || receipts.size() < 2) {
      return plan;
    }
    List<Map<String, Object>> calls = new ArrayList<>(plan.calls());
    List<QtyReceipt> named =
        receipts.stream().filter(r -> str(userText).contains(r.name())).toList();
    if (named.size() == 1) {
      return plan;
    }
    int rollbackHits = 0;
    for (QtyReceipt r : receipts) {
      if (calls.stream().anyMatch(c -> callCoversReceipt(c, r, refs))) {
        rollbackHits++;
      }
    }
    if (rollbackHits < 1 || rollbackHits >= receipts.size()) {
      return plan;
    }
    for (QtyReceipt r : receipts) {
      if (calls.stream().anyMatch(c -> callCoversReceipt(c, r, refs))) {
        continue;
      }
      Map<String, Object> hit = findProbeRowForReceipt(r, probedRows);
      if (hit == null || str(hit.get("ref")).isEmpty()) {
        continue;
      }
      Map<String, Object> upd = new LinkedHashMap<>();
      upd.put("use", "item.update");
      upd.put("ref", hit.get("ref"));
      upd.put("name", str(hit.get("name")).isEmpty() ? r.name() : hit.get("name"));
      upd.put("quantity", Double.isFinite(r.beforeNum()) ? r.beforeNum() : r.before());
      calls.add(upd);
      if (refs != null) {
        refs.put(str(hit.get("ref")), hit);
      }
    }
    return new PlanParser.ActPlan(plan.ask(), plan.probe(), calls, plan.reply());
  }

  private static Map<String, Object> findProbeRowForReceipt(
      QtyReceipt receipt, List<Map<String, Object>> probedRows) {
    List<Map<String, Object>> rows = new ArrayList<>();
    if (probedRows != null) {
      for (Map<String, Object> row : probedRows) {
        if (row != null && receipt.name().equals(str(row.get("name")))) {
          rows.add(row);
        }
      }
    }
    if (rows.isEmpty()) {
      return null;
    }
    if (rows.size() == 1) {
      return rows.get(0);
    }
    for (Map<String, Object> row : rows) {
      if (qtyEquals(row.get("quantity"), receipt.afterNum()) || qtyEquals(row.get("quantity"), receipt.after())) {
        return row;
      }
    }
    if (!receipt.spaceName().isEmpty()) {
      List<Map<String, Object>> byPlace =
          rows.stream().filter(r -> receipt.spaceName().equals(str(r.get("spaceName")))).toList();
      if (byPlace.size() == 1) {
        return byPlace.get(0);
      }
      for (Map<String, Object> row : byPlace) {
        if (qtyEquals(row.get("quantity"), receipt.afterNum()) || qtyEquals(row.get("quantity"), receipt.after())) {
          return row;
        }
      }
    }
    return null;
  }

  private static boolean qtyEquals(Object a, Object b) {
    if (a == null || b == null || "".equals(a) || "".equals(b)) {
      return false;
    }
    try {
      double na = a instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(a));
      double nb = b instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(b));
      if (Double.isFinite(na) && Double.isFinite(nb)) {
        return na == nb;
      }
    } catch (Exception ignored) {
    }
    return String.valueOf(a).equals(String.valueOf(b));
  }

  private static double parseDouble(String s) {
    try {
      return Double.parseDouble(s);
    } catch (Exception e) {
      return Double.NaN;
    }
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
