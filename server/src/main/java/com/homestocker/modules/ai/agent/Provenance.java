package com.homestocker.modules.ai.agent;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 核验写调用申报的 `_src`：只做确定性检查（原话是否出现、短号是否存在、行里字段值是否等于申报值），
 * 不判断模型推理对不对。
 */
public final class Provenance {

  public static final String SRC = "_src";

  /** 本批要求申报的字段。其余字段留到后续 change。 */
  public static final List<String> FIELDS = List.of("spaceName", "locationName", "quantity");

  private static final Set<String> CHECKED = Set.of("spaceName", "locationName", "quantity", "ref");

  private Provenance() {}

  /** 通过或未申报返回 null；核验失败返回结构化回执。 */
  public static ToolFeedback verify(
      String groundText,
      String habitSpace,
      Map<String, Object> call,
      List<Map<String, Object>> rows) {
    Map<String, Object> src = srcOf(call);
    if (src.isEmpty()) {
      return null;
    }
    for (Map.Entry<String, Object> entry : src.entrySet()) {
      String field = entry.getKey();
      if (!CHECKED.contains(field) || !(entry.getValue() instanceof Map<?, ?> spec)) {
        continue;
      }
      String from = str(spec.get("from")).toLowerCase();
      String given = str(call.get(field));
      ToolFeedback bad =
          switch (from) {
            case "user" -> checkUser(field, given, str(spec.get("quote")), groundText);
            case "probe" -> checkProbe(field, given, str(spec.get("via")), rows);
            case "inference" -> checkInference(field, given, str(spec.get("via")), rows);
            case "habit" -> checkHabit(field, given, habitSpace);
            default -> null;
          };
      if (bad != null) {
        return bad;
      }
    }
    return null;
  }

  /** 未申报的字段名，用于 audit.noSource 计数。 */
  public static List<String> missingFields(Map<String, Object> call) {
    Map<String, Object> src = srcOf(call);
    List<String> out = new ArrayList<>();
    for (String field : FIELDS) {
      String given = str(call == null ? null : call.get(field));
      if (given.isEmpty()) {
        continue;
      }
      if (!src.containsKey(field)) {
        out.add(field);
      }
    }
    return out;
  }

  /** 申报过的字段：`spaceName=user` 这样的片段，用于审计日志。 */
  public static String describe(Map<String, Object> call) {
    Map<String, Object> src = srcOf(call);
    if (src.isEmpty()) {
      return "";
    }
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, Object> entry : src.entrySet()) {
      if (!(entry.getValue() instanceof Map<?, ?> spec)) {
        continue;
      }
      if (sb.length() > 0) {
        sb.append(',');
      }
      sb.append(entry.getKey()).append('=').append(str(spec.get("from")));
    }
    return sb.toString();
  }

  /** 删除/合并类调用按推断选中时，给确认卡补一句依据。 */
  public static String inferredRefNote(Map<String, Object> call) {
    Map<String, Object> src = srcOf(call);
    Object raw = src.get("ref");
    if (!(raw instanceof Map<?, ?> spec)) {
      return "";
    }
    if (!"inference".equals(str(spec.get("from")).toLowerCase())) {
      return "";
    }
    String via = str(spec.get("via"));
    return via.isEmpty() ? "" : "（按推断选中，依据 " + via + "）";
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> srcOf(Map<String, Object> call) {
    Object raw = call == null ? null : call.get(SRC);
    return raw instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
  }

  private static ToolFeedback checkUser(String field, String given, String quote, String groundText) {
    if (quote.isEmpty() || groundText == null || !groundText.contains(quote)) {
      return fail(field, given, "user").quoted(quote);
    }
    return null;
  }

  private static ToolFeedback checkProbe(
      String field, String given, String via, List<Map<String, Object>> rows) {
    if (via.isEmpty()) {
      return fail(field, given, "probe");
    }
    Map<String, Object> row = findRow(rows, via);
    if (row == null) {
      return fail(field, given, "probe");
    }
    if ("ref".equals(field)) {
      return null;
    }
    return sameValue(field, row.get(field), given) ? null : fail(field, given, "probe");
  }

  private static ToolFeedback checkInference(
      String field, String given, String via, List<Map<String, Object>> rows) {
    if (via.isEmpty() || findRow(rows, via) == null) {
      return ToolFeedback.of(GroundingCodes.INFERENCE_NO_BASIS, field, given).declared("inference");
    }
    return null;
  }

  private static ToolFeedback checkHabit(String field, String given, String habitSpace) {
    if (!"spaceName".equals(field)) {
      return null;
    }
    if (habitSpace == null || habitSpace.isBlank() || !habitSpace.trim().equals(given)) {
      return fail(field, given, "habit");
    }
    return null;
  }

  private static ToolFeedback fail(String field, String given, String declared) {
    String code =
        switch (field) {
          case "quantity" -> GroundingCodes.QTY_UNGROUNDED;
          case "ref" -> GroundingCodes.REF_UNKNOWN;
          default -> GroundingCodes.PLACE_UNGROUNDED;
        };
    return ToolFeedback.of(code, field, given).declared(declared);
  }

  private static Map<String, Object> findRow(List<Map<String, Object>> rows, String ref) {
    if (rows == null || ref.isEmpty()) {
      return null;
    }
    for (Map<String, Object> row : rows) {
      if (row == null) {
        continue;
      }
      if (ref.equalsIgnoreCase(str(row.get("ref"))) || ref.equals(str(row.get("itemId")))) {
        return row;
      }
    }
    return null;
  }

  private static boolean sameValue(String field, Object rowValue, String given) {
    if ("quantity".equals(field)) {
      BigDecimal a = decimal(rowValue);
      BigDecimal b = decimal(given);
      if (a != null && b != null) {
        return a.compareTo(b) == 0;
      }
    }
    return str(rowValue).equals(given);
  }

  private static BigDecimal decimal(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof BigDecimal d) {
      return d.stripTrailingZeros();
    }
    if (value instanceof Number n) {
      return new BigDecimal(n.toString()).stripTrailingZeros();
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

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }

  /** 供测试构造：把字段申报塞进 call。 */
  static Map<String, Object> withSource(Map<String, Object> call, Map<String, Object> src) {
    Map<String, Object> copy = new LinkedHashMap<>(call);
    copy.put(SRC, src);
    return copy;
  }
}
