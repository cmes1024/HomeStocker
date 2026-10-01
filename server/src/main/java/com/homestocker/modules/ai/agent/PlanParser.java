package com.homestocker.modules.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.modules.ai.app.AssistPromptTexts;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Port of agent/plan.js */
public final class PlanParser {

  private static final Set<String> BOUNDARY_ASKS =
      Set.of(AssistPromptTexts.CAPABILITY_LIMIT_ASK, AssistPromptTexts.OUT_OF_SCOPE_ASK);

  private PlanParser() {}

  public record ActPlan(
      List<Map<String, Object>> ask,
      Map<String, Object> probe,
      List<Map<String, Object>> calls,
      String reply) {}

  public static ActPlan parsePlan(String text, ObjectMapper objectMapper) {
    String raw =
        str(text)
            .trim()
            .replaceFirst("^```(?:json)?\\s*", "")
            .replaceFirst("\\s*```$", "");
    try {
      JsonNode parsed = objectMapper.readTree(raw);
      if (!parsed.isObject()) {
        throw new IllegalArgumentException("invalid plan shape");
      }
      List<Map<String, Object>> ask = normalizeAsk(parsed.get("ask"));
      Map<String, Object> probe = normalizeProbe(parsed.get("probe"));
      List<Map<String, Object>> calls = new ArrayList<>();
      if (parsed.has("calls") && parsed.get("calls").isArray()) {
        for (JsonNode c : parsed.get("calls")) {
          if (c.isObject()) {
            calls.add(objectMapper.convertValue(c, Map.class));
          }
          if (calls.size() >= 20) {
            break;
          }
        }
      }
      String reply = normalizeReply(parsed.path("reply").asText(""));
      if (reply.isEmpty()) {
        reply = normalizeReply(parsed.path("answer").asText(""));
      }
      if (reply.isEmpty()) {
        reply = normalizeReply(parsed.path("message").asText(""));
      }
      if (!ask.isEmpty() || !calls.isEmpty()) {
        reply = "";
      }
      ActPlan plan = new ActPlan(ask, probe, calls, reply);
      return coerceBoundaryReplyToAsk(plan);
    } catch (Exception e) {
      throw new IllegalArgumentException("invalid plan json", e);
    }
  }

  private static ActPlan coerceBoundaryReplyToAsk(ActPlan plan) {
    if (!plan.ask.isEmpty() || !plan.calls.isEmpty() || plan.probe != null) {
      return plan;
    }
    String reply = str(plan.reply).trim();
    if (!BOUNDARY_ASKS.contains(reply)) {
      return plan;
    }
    List<Map<String, Object>> ask = new ArrayList<>();
    Map<String, Object> one = new LinkedHashMap<>();
    one.put("question", reply);
    one.put("options", List.of());
    ask.add(one);
    return new ActPlan(ask, null, List.of(), "");
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> normalizeAsk(JsonNode raw) {
    if (raw == null || raw.isNull()) {
      return List.of();
    }
    List<JsonNode> list = new ArrayList<>();
    if (raw.isArray()) {
      raw.forEach(list::add);
    } else {
      list.add(raw);
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (JsonNode item : list) {
      if (item == null || item.isNull()) {
        continue;
      }
      Map<String, Object> row = new LinkedHashMap<>();
      if (item.isTextual()) {
        String q = item.asText("").trim();
        if (!q.isEmpty()) {
          row.put("question", q);
          row.put("options", List.of());
          out.add(row);
        }
        continue;
      }
      String question =
          item.path("question").asText(item.path("text").asText(item.path("prompt").asText("")))
              .trim();
      if (question.isEmpty()) {
        continue;
      }
      row.put("question", question);
      List<Map<String, Object>> options = new ArrayList<>();
      if (item.has("options") && item.get("options").isArray()) {
        for (JsonNode opt : item.get("options")) {
          Map<String, Object> choice = optionChoice(opt);
          if (choice != null) {
            options.add(choice);
          }
        }
      }
      row.put("options", options);
      out.add(row);
    }
    return out;
  }

  private static Map<String, Object> optionChoice(JsonNode opt) {
    if (opt == null || opt.isNull()) {
      return null;
    }
    if (opt.isTextual()) {
      return optionChoice(opt.asText(), opt.asText());
    }
    String label = opt.path("label").asText(opt.path("value").asText("")).trim();
    String value = opt.path("value").asText(opt.path("label").asText("")).trim();
    return optionChoice(label, value);
  }

  private static Map<String, Object> optionChoice(String label, String value) {
    String l = str(label).trim();
    String v = str(value).trim();
    if (l.isEmpty() && v.isEmpty()) {
      return null;
    }
    String useLabel = l.isEmpty() ? v : l;
    boolean machine = v.matches("(?i)^[a-z][a-z0-9_-]*$") && v.length() <= 32;
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("label", useLabel);
    m.put("value", machine || v.isEmpty() ? useLabel : v);
    return m;
  }

  private static Map<String, Object> normalizeProbe(JsonNode raw) {
    if (raw == null || raw.isNull() || !raw.isObject()) {
      return null;
    }
    String spaceName = raw.path("spaceName").asText("").trim();
    String locationName = raw.path("locationName").asText("").trim();
    String name = raw.path("name").asText("").trim();
    List<String> names = new ArrayList<>();
    if (raw.has("names") && raw.get("names").isArray()) {
      for (JsonNode n : raw.get("names")) {
        String s = n.asText("").trim();
        if (!s.isEmpty()) {
          names.add(s);
        }
      }
    }
    boolean listAll = raw.path("list").asBoolean(false) || "family".equals(raw.path("scope").asText("").trim());
    if (spaceName.isEmpty() && locationName.isEmpty() && name.isEmpty() && names.isEmpty() && !listAll) {
      return null;
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("spaceName", spaceName);
    out.put("locationName", locationName);
    out.put("name", name);
    out.put("listAll", listAll);
    if (!names.isEmpty()) {
      out.put("names", names);
    }
    return out;
  }

  private static String normalizeReply(String raw) {
    String text = str(raw).trim();
    if (text.isEmpty()) {
      return "";
    }
    return text.length() > 800 ? text.substring(0, 800) : text;
  }

  public static Map<String, Object> draftFromCalls(List<Map<String, Object>> calls) {
    Map<String, Object> many = null;
    if (calls != null) {
      for (Map<String, Object> c : calls) {
        if (c != null && "item.createMany".equals(str(c.get("use")))) {
          many = c;
          break;
        }
      }
    }
    if (many != null && many.get("items") instanceof List<?> items && !items.isEmpty()) {
      Object firstObj = items.get(0);
      Map<String, Object> first =
          firstObj instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
      return draftFields(first, str(many.get("spaceName")));
    }
    Map<String, Object> create = Map.of();
    if (calls != null) {
      for (Map<String, Object> c : calls) {
        if (c != null && "item.create".equals(str(c.get("use")))) {
          create = c;
          break;
        }
      }
      if (create.isEmpty() && !calls.isEmpty() && calls.get(0) != null) {
        create = calls.get(0);
      }
    }
    return draftFields(create, "");
  }

  private static Map<String, Object> draftFields(Map<String, Object> create, String fallbackSpace) {
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("name", str(create.get("name")).trim());
    d.put("quantity", create.get("quantity"));
    d.put("unit", str(create.get("unit")).trim());
    d.put("note", str(create.get("note")).trim());
    String sn = str(create.get("spaceName")).trim();
    d.put("spaceName", sn.isEmpty() ? fallbackSpace : sn);
    d.put("locationName", str(create.get("locationName")).trim());
    d.put("expireDate", create.get("expireDate") != null ? create.get("expireDate") : "");
    d.put("productionDate", create.get("productionDate") != null ? create.get("productionDate") : "");
    return d;
  }

  public static String probeOptionLabel(Map<String, Object> row) {
    if (row == null) {
      return "";
    }
    String qty = str(row.get("quantity")) + str(row.get("unit"));
    String place = TreeMatch.placeLabel(str(row.get("spaceName")), str(row.get("locationName")));
    List<String> bits = new ArrayList<>();
    bits.add(str(row.get("name")));
    if (!qty.isEmpty()) {
      bits.add(qty);
    }
    if (!place.isEmpty()) {
      bits.add(place);
    }
    return String.join(" · ", bits);
  }

  public static List<Map<String, Object>> optionsFromProbeRows(List<Map<String, Object>> rows) {
    List<Map<String, Object>> opts = new ArrayList<>();
    java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
    if (rows != null) {
      for (Map<String, Object> row : rows) {
        String label = probeOptionLabel(row);
        if (label.isEmpty() || seen.contains(label)) {
          continue;
        }
        seen.add(label);
        Map<String, Object> choice = optionChoice(label, label);
        if (choice != null) {
          opts.add(choice);
        }
      }
    }
    if (opts.size() >= 2) {
      Map<String, Object> all = optionChoice("相关记录都改", "相关记录都改");
      if (all != null) {
        opts.add(all);
      }
    }
    return opts;
  }

  public static List<Map<String, Object>> enrichAskOptionsFromProbe(
      List<Map<String, Object>> ask, List<Map<String, Object>> probedRows) {
    if (ask == null || ask.isEmpty() || probedRows == null || probedRows.isEmpty()) {
      return ask;
    }
    List<Map<String, Object>> chips = optionsFromProbeRows(probedRows);
    if (chips.isEmpty()) {
      return ask;
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (int i = 0; i < ask.size(); i++) {
      Map<String, Object> item = ask.get(i);
      if (item == null || i > 0) {
        out.add(item);
        continue;
      }
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> options = (List<Map<String, Object>>) item.get("options");
      if (!askOptionsNeedEnrichment(options)) {
        out.add(item);
        continue;
      }
      Map<String, Object> copy = new LinkedHashMap<>(item);
      copy.put("options", chips);
      out.add(copy);
    }
    return out;
  }

  private static boolean askOptionsNeedEnrichment(List<Map<String, Object>> options) {
    if (options == null || options.size() < 2) {
      return true;
    }
    if (options.size() == 1) {
      String t = str(options.get(0).get("label"));
      if (t.matches("(?i).*P\\d+.*") && t.matches(".*[和;；].*")) {
        return true;
      }
    }
    return options.stream()
        .allMatch(o -> str(o.get("label")).trim().matches("(?i)^[FPR]\\d+$"));
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
