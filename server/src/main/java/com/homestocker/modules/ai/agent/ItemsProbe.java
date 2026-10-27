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
  static final int RECALL_MAX_ROWS = 12;

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

  /** 开场事实：最近更新的物资，不分配短号。 */
  public String renderOpeningSnapshot(String familyId, Map<String, Object> tree) {
    List<ItemRow> list = listItemsCompact(familyId, null, null, List.of(), FETCH_FAMILY);
    if (list.isEmpty()) {
      return "无";
    }
    StringBuilder sb = new StringBuilder();
    int shown = 0;
    int cap = Math.min(CAP_FAMILY, list.size());
    for (int i = 0; i < cap; i++) {
      Map<String, Object> row = ActRefs.compactItem(toItemMap(list.get(i)), "", tree);
      String label = PlanParser.probeOptionLabel(row);
      if (label.isEmpty()) {
        continue;
      }
      if (shown > 0) {
        sb.append('\n');
      }
      sb.append(label);
      shown++;
    }
    if (shown == 0) {
      return "无";
    }
    if (list.size() > shown) {
      sb.append("\n（仅最近若干行，未列全）");
    }
    return sb.toString();
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
    int base = nextProbeNumber(refs);
    for (int i = 0; i < Math.min(cap, list.size()); i++) {
      String ref = "P" + (base + i);
      Map<String, Object> row = ActRefs.compactItem(toItemMap(list.get(i)), ref, tree);
      refs.put(ref, row);
      rows.add(row);
    }
    return rows;
  }

  /**
   * 本句里出现的台账物资名 → 现有行。不决定写哪个接口。短号从已占用的 P* 之后继续。
   */
  public List<Map<String, Object>> recallNamedInText(
      String familyId,
      Map<String, Object> tree,
      String text,
      Map<String, Map<String, Object>> refs) {
    List<String> matched = NameRecall.match(text, itemRepository.listNames(familyId));
    List<Map<String, Object>> rows = new ArrayList<>();
    int n = nextProbeNumber(refs);
    for (String name : matched) {
      if (rows.size() >= RECALL_MAX_ROWS) {
        break;
      }
      for (ItemRow doc : itemRepository.findByFamilyAndExactName(familyId, name, 4)) {
        if (rows.size() >= RECALL_MAX_ROWS) {
          break;
        }
        if (!familyId.equals(doc.familyId())) {
          continue;
        }
        if (alreadyReferenced(refs, doc.id())) {
          continue;
        }
        String ref = "P" + n;
        Map<String, Object> row = ActRefs.compactItem(toItemMap(doc), ref, tree);
        refs.put(ref, row);
        rows.add(row);
        n++;
      }
    }
    return rows;
  }

  private static boolean alreadyReferenced(
      Map<String, Map<String, Object>> refs, String itemId) {
    if (refs == null || itemId == null || itemId.isBlank()) {
      return false;
    }
    for (Map<String, Object> row : refs.values()) {
      if (row != null && itemId.equals(str(row.get("itemId")))) {
        return true;
      }
    }
    return false;
  }

  static int nextProbeNumber(Map<String, Map<String, Object>> refs) {
    int max = 0;
    if (refs != null) {
      for (String key : refs.keySet()) {
        if (key != null && key.matches("(?i)P\\d+")) {
          max = Math.max(max, Integer.parseInt(key.substring(1)));
        }
      }
    }
    return max + 1;
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
    return listItemsCompact(
        familyId,
        spaceId,
        locationId,
        tagId,
        maxQuantity,
        ItemRepository.TagFilter.ANY,
        keywords,
        limit);
  }

  public List<ItemRow> listItemsCompact(
      String familyId,
      String spaceId,
      String locationId,
      String tagId,
      java.math.BigDecimal maxQuantity,
      ItemRepository.TagFilter tagFilter,
      List<String> keywords,
      int limit) {
    int fetchLimit = Math.min(Math.max(limit, 1), 100);
    boolean hasKeywords = keywords != null && !keywords.isEmpty();
    // 有关键字时把名称条件下推：先取 100 行再内存过滤，家庭超 100 件会把新物资漏掉
    List<ItemRow> list;
    if (tagFilter == ItemRepository.TagFilter.UNTAGGED) {
      list =
          hasKeywords
              ? itemRepository.searchAnyUntagged(
                  familyId, blankToNull(spaceId), maxQuantity, keywords, fetchLimit)
              : itemRepository.listUntagged(
                  familyId, blankToNull(spaceId), maxQuantity, fetchLimit);
    } else if (tagFilter == ItemRepository.TagFilter.TAGGED) {
      list =
          hasKeywords
              ? itemRepository.searchAnyTagged(
                  familyId, blankToNull(spaceId), maxQuantity, keywords, fetchLimit)
              : itemRepository.listTagged(
                  familyId, blankToNull(spaceId), maxQuantity, fetchLimit);
    } else {
      list =
          hasKeywords
              ? itemRepository.searchAny(
                  familyId,
                  blankToNull(spaceId),
                  blankToNull(tagId),
                  maxQuantity,
                  keywords,
                  fetchLimit)
              : itemRepository.list(
                  familyId,
                  blankToNull(spaceId),
                  blankToNull(tagId),
                  maxQuantity,
                  fetchLimit);
    }
    if (locationId != null && !locationId.isBlank()) {
      list = list.stream().filter(i -> locationId.equals(i.locationId())).toList();
    }
    if (hasKeywords) {
      list = filterByName(list, keywords);
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

  /**
   * 查到与关键字同名的行时，只留这些行。「米」不再把「大米」算进来。
   * 没有任何同名行时，仍按名称包含匹配，方便「奶」找到「牛奶」。
   */
  static List<ItemRow> filterByName(List<ItemRow> list, List<String> keywords) {
    if (list == null || list.isEmpty() || keywords == null || keywords.isEmpty()) {
      return list == null ? List.of() : list;
    }
    List<ItemRow> exact = new ArrayList<>();
    for (ItemRow row : list) {
      if (nameEqualsKeyword(row.name(), keywords)) {
        exact.add(row);
      }
    }
    if (!exact.isEmpty()) {
      return exact;
    }
    List<ItemRow> fuzzy = new ArrayList<>();
    for (ItemRow row : list) {
      if (nameContainsKeyword(row.name(), keywords)) {
        fuzzy.add(row);
      }
    }
    return fuzzy;
  }

  private static boolean nameEqualsKeyword(String itemName, List<String> keywords) {
    String n = itemName == null ? "" : itemName.trim().toLowerCase(Locale.ROOT);
    if (n.isEmpty()) {
      return false;
    }
    for (String kw : keywords) {
      if (kw != null && n.equals(kw.trim().toLowerCase(Locale.ROOT))) {
        return true;
      }
    }
    return false;
  }

  private static boolean nameContainsKeyword(String itemName, List<String> keywords) {
    String n = itemName == null ? "" : itemName.toLowerCase(Locale.ROOT);
    if (n.isEmpty()) {
      return false;
    }
    for (String kw : keywords) {
      if (kw != null && !kw.isBlank() && n.contains(kw.trim().toLowerCase(Locale.ROOT))) {
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
