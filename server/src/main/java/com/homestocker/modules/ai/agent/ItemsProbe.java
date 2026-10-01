package com.homestocker.modules.ai.agent;

import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Port of agent/itemsQuery.js */
@Component
public class ItemsProbe {

  private static final int FETCH_NAMED = 100;
  private static final int FETCH_SCOPED = 80;
  private static final int FETCH_FAMILY = 80;
  private static final int CAP_NAMED = 24;
  private static final int CAP_SCOPED = 12;
  private static final int CAP_FAMILY = 40;

  private final ItemRepository itemRepository;

  public ItemsProbe(ItemRepository itemRepository) {
    this.itemRepository = itemRepository;
  }

  public Map<String, Object> loadFocus(
      String familyId, Map<String, Object> tree, String itemId) {
    String id = itemId == null ? "" : itemId.trim();
    if (id.isEmpty()) {
      return null;
    }
    Optional<ItemRow> row = itemRepository.findById(id);
    if (row.isEmpty() || !familyId.equals(row.get().familyId())) {
      return null;
    }
    return ActRefs.compactItem(toItemMap(row.get()), "F1", tree);
  }

  public List<Map<String, Object>> loadItemsByIds(
      String familyId,
      Map<String, Object> tree,
      List<String> ids,
      Map<String, Map<String, Object>> refs,
      String skipItemId) {
    List<String> unique = new ArrayList<>();
    if (ids != null) {
      for (String id : ids) {
        if (id != null && !id.isBlank() && !id.equals(skipItemId) && !unique.contains(id)) {
          unique.add(id);
        }
      }
    }
    if (unique.isEmpty()) {
      return List.of();
    }
    List<ItemRow> list = itemRepository.findByIds(unique);
    List<Map<String, Object>> rows = new ArrayList<>();
    for (String id : unique) {
      ItemRow doc =
          list.stream().filter(r -> id.equals(r.id())).findFirst().orElse(null);
      if (doc == null || !familyId.equals(doc.familyId())) {
        continue;
      }
      Map<String, Object> row = ActRefs.compactItem(toItemMap(doc), "", tree);
      refs.put("ID:" + id, row);
      rows.add(row);
    }
    return rows;
  }

  public List<Map<String, Object>> runProbe(
      String familyId,
      Map<String, Object> tree,
      Map<String, Object> probe,
      Map<String, Map<String, Object>> refs) {
    if (probe == null) {
      return List.of();
    }
    Map<String, Object> space = TreeMatch.matchSpace(tree, str(probe.get("spaceName")));
    Map<String, Object> loc = space != null ? TreeMatch.matchLocation(space, str(probe.get("locationName"))) : null;
    String locationName = str(probe.get("locationName")).trim();
    if (!locationName.isEmpty() && loc == null) {
      List<Map<String, Object>> hits = new ArrayList<>();
      for (Map<String, Object> s : spaces(tree)) {
        Map<String, Object> hit = TreeMatch.matchLocation(s, locationName);
        if (hit != null) {
          Map<String, Object> pair = new LinkedHashMap<>();
          pair.put("space", s);
          pair.put("loc", hit);
          hits.add(pair);
        }
      }
      if (hits.size() == 1) {
        space = (Map<String, Object>) hits.get(0).get("space");
        loc = (Map<String, Object>) hits.get(0).get("loc");
      }
    }
    if (!locationName.isEmpty() && loc == null) {
      return List.of();
    }

    List<String> keywords = normalizeKeywords(probe);
    boolean listAll =
        Boolean.TRUE.equals(probe.get("listAll"))
            || (str(probe.get("spaceName")).isEmpty()
                && locationName.isEmpty()
                && space == null
                && loc == null
                && keywords.isEmpty());

    String spaceId = space != null ? str(space.get("id")) : null;
    String locationId = loc != null ? str(loc.get("id")) : null;
    int fetchLimit = keywords.isEmpty() ? (listAll ? FETCH_FAMILY : FETCH_SCOPED) : FETCH_NAMED;
    List<ItemRow> list =
        listItemsCompact(familyId, spaceId, locationId, null, null, keywords, fetchLimit);
    int cap = resultCapFor(spaceId, locationId, keywords);
    List<Map<String, Object>> rows = new ArrayList<>();
    for (int i = 0; i < Math.min(cap, list.size()); i++) {
      Map<String, Object> row = ActRefs.compactItem(toItemMap(list.get(i)), "P" + (i + 1), tree);
      refs.put(str(row.get("ref")), row);
      rows.add(row);
    }
    return rows;
  }

  public List<ItemRow> listItemsCompact(
      String familyId, String spaceId, String locationId, List<String> keywords, int limit) {
    return listItemsCompact(familyId, spaceId, locationId, null, null, keywords, limit);
  }

  public List<ItemRow> listItemsCompact(
      String familyId,
      String spaceId,
      String locationId,
      String tagId,
      java.math.BigDecimal maxQuantity,
      List<String> keywords,
      int limit) {
    int fetchLimit = Math.min(Math.max(limit, 1), 100);
    List<ItemRow> list =
        itemRepository.list(
            familyId,
            blankToNull(spaceId),
            blankToNull(tagId),
            maxQuantity,
            fetchLimit);
    if (locationId != null && !locationId.isBlank()) {
      list = list.stream().filter(i -> locationId.equals(i.locationId())).toList();
    }
    if (!keywords.isEmpty()) {
      list =
          list.stream()
              .filter(i -> nameMatchesKeywords(i.name(), keywords))
              .toList();
    }
    return list;
  }

  public List<Map<String, Object>> listItemsCompactMaps(
      String familyId,
      Map<String, Object> tree,
      String spaceId,
      String locationId,
      List<String> keywords,
      int limit) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (ItemRow row : listItemsCompact(familyId, spaceId, locationId, keywords, limit)) {
      out.add(toItemMap(row));
    }
    return out;
  }

  private static boolean nameMatchesKeywords(String itemName, List<String> keywords) {
    if (keywords == null || keywords.isEmpty()) {
      return true;
    }
    String n = itemName == null ? "" : itemName.toLowerCase(Locale.ROOT);
    if (n.isEmpty()) {
      return false;
    }
    for (String kw : keywords) {
      if (n.contains(kw)) {
        return true;
      }
    }
    return false;
  }

  private static int resultCapFor(String spaceId, String locationId, List<String> keywords) {
    if (keywords != null && !keywords.isEmpty()) {
      return CAP_NAMED;
    }
    if ((spaceId != null && !spaceId.isBlank()) || (locationId != null && !locationId.isBlank())) {
      return CAP_SCOPED;
    }
    return CAP_FAMILY;
  }

  @SuppressWarnings("unchecked")
  private static List<String> normalizeKeywords(Map<String, Object> probe) {
    List<String> out = new ArrayList<>();
    java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
    java.util.function.Consumer<String> push =
        raw -> {
          String k = str(raw).trim().toLowerCase(Locale.ROOT);
          if (!k.isEmpty() && seen.add(k)) {
            out.add(k);
          }
        };
    push.accept(str(probe.get("name")));
    if (probe.get("names") instanceof List<?> names) {
      for (Object n : names) {
        push.accept(str(n));
      }
    }
    return out;
  }

  private static Map<String, Object> toItemMap(ItemRow row) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", row.id());
    m.put("familyId", row.familyId());
    m.put("name", row.name());
    m.put("quantity", row.quantity());
    m.put("unit", row.unit());
    m.put("note", row.note());
    m.put("spaceId", row.spaceId());
    m.put("locationId", row.locationId());
    m.put("productionDate", row.productionDate());
    m.put("expireDate", row.expireDate());
    m.put("tagIds", row.tagIds());
    return m;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> spaces(Map<String, Object> tree) {
    Object raw = tree != null ? tree.get("spaces") : null;
    if (!(raw instanceof List<?> list)) {
      return List.of();
    }
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object o : list) {
      if (o instanceof Map<?, ?> m) {
        out.add((Map<String, Object>) m);
      }
    }
    return out;
  }

  private static String blankToNull(String s) {
    return s == null || s.isBlank() ? null : s;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
