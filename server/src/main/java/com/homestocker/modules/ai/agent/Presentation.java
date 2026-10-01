package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Port of agent/presentation.js */
public final class Presentation {

  public static final int REPLY_CARD_LIMIT = 8;

  private static final Pattern ACTION_SUMMARY =
      Pattern.compile("^(已改|已记下|已删掉|已修改)\\s+(.+?)：(.+)$");

  private Presentation() {}

  public record PresentationView(String lead, List<Map<String, Object>> blocks, List<String> lines) {}

  public static PresentationView buildInventoryPresentation(
      List<Map<String, Object>> list, Map<String, Object> tree, String prefix, String emptyText) {
    List<Map<String, Object>> rows = list != null ? list : List.of();
    String label = prefix != null ? prefix : "查询";
    if (rows.isEmpty()) {
      String lead = emptyText != null ? emptyText : label + "：没有找到匹配的物品";
      return new PresentationView(lead, List.of(), List.of(lead));
    }
    List<Map<String, Object>> cards = new ArrayList<>();
    for (int i = 0; i < Math.min(REPLY_CARD_LIMIT, rows.size()); i++) {
      cards.add(buildItemCard(rows.get(i), tree));
    }
    String footer =
        rows.size() > REPLY_CARD_LIMIT ? "另有 " + (rows.size() - REPLY_CARD_LIMIT) + " 件未展开" : "";
    Map<String, Object> block = new LinkedHashMap<>();
    block.put("cards", cards);
    if (!footer.isEmpty()) {
      block.put("footer", footer);
    }
    String lead = label + "：找到 " + rows.size() + " 件";
    List<String> lines = new ArrayList<>();
    lines.add(lead);
    for (Map<String, Object> card : cards) {
      lines.add(cardToCompactLine(card));
    }
    if (!footer.isEmpty()) {
      lines.add(footer);
    }
    return new PresentationView(lead, List.of(block), lines);
  }

  public static PresentationView buildExecutionPresentation(
      List<Map<String, Object>> executed,
      List<Map<String, Object>> failed,
      List<Map<String, Object>> possibleDuplicates,
      Map<String, Object> tree) {
    List<Map<String, Object>> blocks = new ArrayList<>();
    List<Map<String, Object>> actionCards = new ArrayList<>();
    String inventoryLead = "";
    List<String> inventoryLines = new ArrayList<>();

    if (executed != null) {
      for (Map<String, Object> row : executed) {
        if (row != null && row.get("inventory") instanceof List<?>) {
          String prefix =
              "item.listExpiring".equals(str(row.get("use")))
                  ? "临期/过期"
                  : str(row.get("inventoryPrefix")).isEmpty()
                      ? "查询"
                      : str(row.get("inventoryPrefix"));
          String emptyText =
              "item.listExpiring".equals(str(row.get("use"))) ? "没有临期或过期物品" : "";
          @SuppressWarnings("unchecked")
          List<Map<String, Object>> invList = (List<Map<String, Object>>) row.get("inventory");
          PresentationView inv = buildInventoryPresentation(invList, tree, prefix, emptyText);
          if (inventoryLead.isEmpty()) {
            inventoryLead = inv.lead();
          }
          inventoryLines.addAll(inv.lines());
          blocks.addAll(inv.blocks());
          continue;
        }
        if (row != null && "knowledge.get".equals(str(row.get("use")))) {
          @SuppressWarnings("unchecked")
          Map<String, Object> knowledge = (Map<String, Object>) row.get("knowledge");
          String title =
              knowledge != null
                  ? str(knowledge.get("title"))
                  : str(row.get("summary")).lines().findFirst().orElse("产品说明");
          List<String> facts = new ArrayList<>();
          for (String line : str(row.get("summary")).split("\n")) {
            String s = line.trim();
            if (!s.isEmpty() && !s.equals(title)) {
              facts.add(s);
            }
            if (facts.size() >= 3) {
              break;
            }
          }
          if (inventoryLead.isEmpty()) {
            inventoryLead = facts.isEmpty() ? title : facts.get(0);
          }
          inventoryLines.addAll(facts);
          Map<String, Object> card = new LinkedHashMap<>();
          card.put("title", title);
          if (!facts.isEmpty()) {
            card.put("facts", facts);
          }
          blocks.add(Map.of("cards", List.of(card)));
          continue;
        }
        if (row != null && "page.get".equals(str(row.get("use")))) {
          if ("navLinks".equals(str(row.get("ui")))) {
            if (!str(row.get("summary")).isEmpty() && inventoryLead.isEmpty()) {
              inventoryLead = str(row.get("summary"));
            }
            continue;
          }
          if (row.get("pageDoc") != null) {
            continue;
          }
        }
        if (row != null && !str(row.get("summary")).isEmpty()) {
          Map<String, Object> card = actionCardFromSummary(str(row.get("summary")), "ok");
          if (card != null) {
            actionCards.add(card);
          }
        }
      }
    }
    if (failed != null) {
      for (Map<String, Object> row : failed) {
        if (row != null && !str(row.get("summary")).isEmpty()) {
          Map<String, Object> card = actionCardFromSummary(str(row.get("summary")), "error");
          if (card != null) {
            actionCards.add(card);
          }
        }
      }
    }
    if (!actionCards.isEmpty()) {
      blocks.add(Map.of("cards", actionCards));
    }
    if (possibleDuplicates != null && !possibleDuplicates.isEmpty()) {
      blocks.add(
          Map.of(
              "title", "可能重复（未合并）",
              "tone", "warn",
              "cards", buildDuplicateCards(possibleDuplicates)));
    }
    long okCount = actionCards.stream().filter(c -> "ok".equals(str(c.get("tone")))).count();
    String lead = inventoryLead;
    if (lead.isEmpty() && okCount > 1) {
      lead = "完成 " + okCount + " 项";
    }
    if (lead.isEmpty() && blocks.isEmpty()) {
      lead = "没有需要执行的操作";
    }
    List<String> lines = new ArrayList<>(inventoryLines);
    for (Map<String, Object> c : actionCards) {
      String line =
          !str(c.get("subtitle")).isEmpty()
              ? str(c.get("title")) + "：" + str(c.get("subtitle"))
              : str(c.get("title"));
      if (!line.isEmpty()) {
        lines.add(line);
      }
    }
    if (possibleDuplicates != null && !possibleDuplicates.isEmpty()) {
      lines.add("可能重复（未合并）：" + duplicateLine(possibleDuplicates));
    }
    if (lines.isEmpty() && !lead.isEmpty()) {
      lines.add(lead);
    }
    return new PresentationView(lead, blocks, lines);
  }

  public static Map<String, Object> attachPresentation(
      Map<String, Object> payload, PresentationView presentation) {
    PresentationView p =
        presentation != null ? presentation : new PresentationView("", List.of(), List.of());
    Map<String, Object> out = new LinkedHashMap<>(payload);
    @SuppressWarnings("unchecked")
    Map<String, Object> report =
        payload.get("report") instanceof Map<?, ?> m
            ? new LinkedHashMap<>((Map<String, Object>) m)
            : new LinkedHashMap<>();
    report.put("lead", p.lead());
    report.put("blocks", p.blocks());
    List<String> lines = p.lines();
    if (lines.isEmpty() && report.get("lines") instanceof List<?> rl) {
      lines = new ArrayList<>();
      for (Object o : rl) {
        lines.add(String.valueOf(o));
      }
    }
    report.put("lines", lines);
    out.put("report", report);
    out.put("lead", p.lead());
    out.put("blocks", p.blocks());
    return out;
  }

  public static PresentationView textOnlyPresentation(String text) {
    String lead = str(text).trim();
    return new PresentationView(lead, List.of(), lead.isEmpty() ? List.of() : List.of(lead));
  }

  private static Map<String, Object> buildItemCard(Map<String, Object> item, Map<String, Object> tree) {
    Map<String, Object> d = resolveItemDisplay(item, tree);
    Map<String, Object> card = new LinkedHashMap<>();
    card.put("title", d.get("title"));
    if (!str(d.get("subtitle")).isEmpty()) {
      card.put("subtitle", d.get("subtitle"));
    }
    if (d.get("facts") instanceof List<?> f && !f.isEmpty()) {
      card.put("facts", f);
    }
    if (d.get("tags") instanceof List<?> t && !t.isEmpty()) {
      card.put("tags", t);
    }
    if (!str(d.get("itemId")).isEmpty()) {
      card.put("itemId", d.get("itemId"));
    }
    return card;
  }

  private static Map<String, Object> resolveItemDisplay(
      Map<String, Object> item, Map<String, Object> tree) {
    TreeMatch.PlaceNames place = TreeMatch.placeNamesForItem(item, tree);
    List<String> tagNames = new ArrayList<>();
    if (item.get("tagIds") instanceof List<?> tagIds && tree != null) {
      for (Object tid : tagIds) {
        if (tree.get("tags") instanceof List<?> tags) {
          for (Object t : tags) {
            if (t instanceof Map<?, ?> tm && String.valueOf(tid).equals(String.valueOf(tm.get("id")))) {
              String n = String.valueOf(tm.get("name"));
              if (!n.isBlank()) {
                tagNames.add(n);
              }
            }
          }
        }
      }
    }
    String subtitle = "";
    if (item.get("quantity") != null && !"".equals(item.get("quantity"))) {
      subtitle = str(item.get("quantity")) + str(item.get("unit"));
    }
    List<String> facts = new ArrayList<>();
    String placeStr = TreeMatch.placeLabel(place.spaceName(), place.locationName());
    if (!placeStr.isEmpty()) {
      facts.add(placeStr);
    }
    if (item.get("expireDate") != null) {
      facts.add("过期 " + item.get("expireDate"));
    }
    if (!str(item.get("note")).isEmpty()) {
      facts.add(str(item.get("note")));
    }
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("title", str(item.get("name")).isEmpty() ? "未命名" : str(item.get("name")));
    d.put("subtitle", subtitle);
    d.put("facts", facts);
    d.put("tags", tagNames);
    d.put("itemId", str(item.get("_id")).isEmpty() ? str(item.get("itemId")) : str(item.get("_id")));
    return d;
  }

  private static String cardToCompactLine(Map<String, Object> card) {
    List<String> bits = new ArrayList<>();
    bits.add(str(card.get("title")));
    if (!str(card.get("subtitle")).isEmpty()) {
      bits.add(str(card.get("subtitle")));
    }
    if (card.get("facts") instanceof List<?> facts) {
      for (Object f : facts) {
        bits.add(String.valueOf(f));
      }
    }
    return String.join(" · ", bits);
  }

  private static List<Map<String, Object>> buildDuplicateCards(
      List<Map<String, Object>> possibleDuplicates) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> d : possibleDuplicates) {
      String place = TreeMatch.placeLabel(str(d.get("spaceName")), str(d.get("locationName")));
      Map<String, Object> card = new LinkedHashMap<>();
      card.put("title", str(d.get("name")).isEmpty() ? "物资" : str(d.get("name")));
      card.put("tone", "warn");
      List<String> bits = new ArrayList<>();
      if (!place.isEmpty()) {
        bits.add(place);
      }
      if (d.get("count") != null) {
        bits.add(d.get("count") + " 条");
      }
      if (!bits.isEmpty()) {
        card.put("subtitle", String.join(" · ", bits));
      }
      out.add(card);
    }
    return out;
  }

  private static Map<String, Object> actionCardFromSummary(String summary, String tone) {
    String text = str(summary).trim();
    if (text.isEmpty()) {
      return null;
    }
    Matcher m = ACTION_SUMMARY.matcher(text);
    if (m.find()) {
      Map<String, Object> card = new LinkedHashMap<>();
      card.put("title", (m.group(1) + " " + m.group(2)).trim());
      card.put("subtitle", m.group(3).trim());
      card.put("tone", tone != null ? tone : "ok");
      return card;
    }
    return Map.of("title", text, "tone", tone != null ? tone : "ok");
  }

  private static String duplicateLine(List<Map<String, Object>> dups) {
    List<String> parts = new ArrayList<>();
    for (Map<String, Object> d : dups) {
      String place = TreeMatch.placeLabel(str(d.get("spaceName")), str(d.get("locationName")));
      List<String> bits = new ArrayList<>();
      if (!place.isEmpty()) {
        bits.add(place);
      }
      if (d.get("count") != null) {
        bits.add(d.get("count") + " 条");
      }
      parts.add(
          (str(d.get("name")).isEmpty() ? "物资" : str(d.get("name")))
              + (bits.isEmpty() ? "" : "：" + String.join(" · ", bits)));
    }
    return String.join("；", parts);
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
