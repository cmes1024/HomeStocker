package com.homestocker.modules.ai.tools;

import com.homestocker.modules.ai.agent.Presentation;
import com.homestocker.modules.ai.app.CapabilityCatalog;
import com.homestocker.modules.family.app.FamilyTreeService;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Port of tools/registry.js */
@Component
public class ToolRegistry {

  private final DomainTools domainTools;
  private final FamilyTreeService familyTreeService;
  private final ItemRepository itemRepository;

  public ToolRegistry(
      DomainTools domainTools,
      FamilyTreeService familyTreeService,
      ItemRepository itemRepository) {
    this.domainTools = domainTools;
    this.familyTreeService = familyTreeService;
    this.itemRepository = itemRepository;
  }

  public Map<String, Object> runAll(ToolContext ctx, List<Map<String, Object>> calls) {
    List<Map<String, Object>> executed = new ArrayList<>();
    List<Map<String, Object>> failed = new ArrayList<>();
    List<Map<String, Object>> pending = new ArrayList<>();
    List<Map<String, Object>> touched = new ArrayList<>();
    List<Map<String, Object>> createdPlaces = new ArrayList<>();
    boolean wrote = false;
    List<Map<String, Object>> subscribeItems = List.of();
    boolean subscribeUi = false;
    List<Map<String, Object>> navLinks = new ArrayList<>();
    int stoppedAt = -1;

    for (int i = 0; i < (calls != null ? calls.size() : 0); i++) {
      Map<String, Object> call = calls.get(i);
      String use = call == null ? "" : String.valueOf(call.get("use")).trim();
      int step = i + 1;
      if (use.isEmpty()
          || CapabilityCatalog.isHardDenied(use)
          || !ctx.catalogMap.containsKey(use)) {
        failed.add(
            failRow(step, use.isEmpty() ? "unknown" : use, "第 " + step + " 步不能执行" + (use.isEmpty() ? "" : "（" + use + "）"), use));
        stoppedAt = i;
        break;
      }
      try {
        ToolResult result = domainTools.run(use, ctx, call, step);
        if (!result.ok) {
          failed.add(failRow(step, use, result.summary, use));
          stoppedAt = i;
          break;
        }
        Map<String, Object> executedRow = new LinkedHashMap<>();
        executedRow.put("step", step);
        executedRow.put("use", use);
        executedRow.put("summary", result.summary);
        if (result.inventory != null) {
          executedRow.put("inventory", result.inventory);
        }
        if (result.inventoryPrefix != null && !result.inventoryPrefix.isBlank()) {
          executedRow.put("inventoryPrefix", result.inventoryPrefix);
        }
        if (result.knowledge != null) {
          executedRow.put("knowledge", result.knowledge);
        }
        if (result.pageDoc != null) {
          executedRow.put("pageDoc", result.pageDoc);
        }
        if (result.ui != null) {
          executedRow.put("ui", result.ui);
        }
        if (result.subscribeItems != null) {
          executedRow.put("subscribeItems", result.subscribeItems);
          subscribeItems = result.subscribeItems;
          if ("subscribePanel".equals(result.ui)) {
            subscribeUi = true;
          }
        }
        if (result.navLinks != null) {
          executedRow.put("navLinks", result.navLinks);
          navLinks.addAll(result.navLinks);
        }
        if (result.stats != null && !result.stats.isEmpty()) {
          executedRow.put("stats", result.stats);
        }
        if (result.habits != null) {
          executedRow.put("habits", result.habits);
        }
        if (result.observe != null && !result.observe.isEmpty()) {
          executedRow.put("observe", result.observe);
        }
        executed.add(executedRow);
        if (result.wrote) {
          wrote = true;
        }
        if (result.remember != null) {
          remember(touched, result.remember);
        }
        if (result.duplicateCheck != null) {
          createdPlaces.add(result.duplicateCheck);
        }
      } catch (Exception e) {
        failed.add(failRow(step, use, "第 " + step + " 步失败：" + e.getMessage(), use));
        stoppedAt = i;
        break;
      }
    }

    if (stoppedAt >= 0 && calls != null) {
      for (int j = stoppedAt + 1; j < calls.size(); j++) {
        Map<String, Object> c = compactCall(calls.get(j));
        if (c != null) {
          pending.add(c);
        }
      }
    }

    familyTreeService.flushFamilyTreeIfDirty(ctx);

    List<Map<String, Object>> possibleDuplicates = new ArrayList<>();
    for (Map<String, Object> row : createdPlaces) {
      String spaceId = String.valueOf(row.get("spaceId"));
      String locationId = String.valueOf(row.get("locationId"));
      String loc = locationId.isEmpty() ? null : locationId;
      List<ItemRow> hits =
          itemRepository.findDuplicates(
              ctx.familyId, spaceId, loc, String.valueOf(row.get("name")));
      if (hits.size() >= 2) {
        possibleDuplicates.add(
            Map.of(
                "name", row.get("name"),
                "spaceName", row.get("spaceName"),
                "locationName", row.get("locationName"),
                "count", hits.size()));
      }
    }

    Presentation.PresentationView presentation =
        Presentation.buildExecutionPresentation(executed, failed, possibleDuplicates, ctx.tree);
    List<String> lines = presentation.lines();
    if (subscribeUi) {
      for (Map<String, Object> row : executed) {
        if ("subscribePanel".equals(row.get("ui")) && row.get("summary") != null) {
          presentation = new Presentation.PresentationView(String.valueOf(row.get("summary")), presentation.blocks(), lines);
          break;
        }
      }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("executed", executed);
    out.put("failed", failed);
    out.put("pending", pending);
    out.put("createClassFailed", failed.stream().anyMatch(f -> Boolean.TRUE.equals(f.get("createClass"))));
    out.put("possibleDuplicates", possibleDuplicates);
    out.put("lines", lines);
    out.put("lead", presentation.lead());
    out.put("blocks", presentation.blocks());
    out.put("touched", compactTouched(touched));
    out.put("wrote", wrote || executed.stream().anyMatch(r -> isWriteUse(String.valueOf(r.get("use")))));
    out.put("subscribeUi", subscribeUi);
    out.put("subscribeItems", subscribeItems);
    out.put("navLinks", navLinks);
    out.put("tree", ctx.tree);
    return out;
  }

  private static boolean isWriteUse(String use) {
    return use.matches(
        "item\\.create|item\\.createMany|item\\.update|item\\.remove|item\\.removeMany|item\\.merge|space\\.create.*|tag\\..*");
  }

  private static boolean isCreateClassUse(String use) {
    return use.matches(
        "^(item\\.create|item\\.createMany|space\\.create|space\\.createMany|space\\.createLocation|space\\.createLocationMany|tag\\.create|tag\\.createMany)$");
  }

  private static Map<String, Object> failRow(int step, String use, String summary, String useRaw) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("step", step);
    m.put("use", use);
    m.put("summary", summary);
    m.put("createClass", isCreateClassUse(useRaw));
    return m;
  }

  @SuppressWarnings("unchecked")
  private static void remember(List<Map<String, Object>> touched, Object row) {
    if (row instanceof List<?> list) {
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          rememberOne(touched, (Map<String, Object>) m);
        }
      }
      return;
    }
    if (row instanceof Map<?, ?> m) {
      rememberOne(touched, (Map<String, Object>) m);
    }
  }

  private static void rememberOne(List<Map<String, Object>> touched, Map<String, Object> row) {
    if (row == null || row.get("itemId") == null) {
      return;
    }
    for (Map<String, Object> t : touched) {
      if (row.get("itemId").equals(t.get("itemId"))) {
        return;
      }
    }
    touched.add(new LinkedHashMap<>(row));
  }

  private static List<Map<String, Object>> compactTouched(List<Map<String, Object>> rows) {
    List<Map<String, Object>> out = new ArrayList<>();
    java.util.Set<String> seen = new java.util.LinkedHashSet<>();
    for (Map<String, Object> row : rows) {
      String id = String.valueOf(row.get("itemId"));
      if (id.isBlank() || seen.contains(id)) {
        continue;
      }
      seen.add(id);
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("itemId", id);
      entry.put("name", row.get("name"));
      if (row.get("op") != null) {
        entry.put("op", row.get("op"));
      }
      if (row.get("quantityBefore") != null) {
        entry.put("quantityBefore", row.get("quantityBefore"));
      }
      if (row.get("quantityAfter") != null) {
        entry.put("quantityAfter", row.get("quantityAfter"));
      }
      out.add(entry);
      if (out.size() >= 12) {
        break;
      }
    }
    return out;
  }

  private static Map<String, Object> compactCall(Map<String, Object> call) {
    if (call == null) {
      return null;
    }
    String use = String.valueOf(call.get("use")).trim();
    if (use.isEmpty()) {
      return null;
    }
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("use", use);
    for (String k :
        List.of(
            "name", "spaceName", "locationName", "quantity", "unit", "ref", "note", "topicId",
            "pageId", "label", "open", "tagged")) {
      if (call.get(k) != null && !"".equals(call.get(k))) {
        row.put(k, call.get(k));
      }
    }
    return row;
  }
}
