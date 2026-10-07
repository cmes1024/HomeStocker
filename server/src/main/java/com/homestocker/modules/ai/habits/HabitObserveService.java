package com.homestocker.modules.ai.habits;

import com.homestocker.infra.jdbc.ActivityRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Aggregates placement/unit patterns from activities (+ optional turn writes) into habit
 * candidate facts for the model. Does not write habits.
 */
@Service
public class HabitObserveService {

  public static final int WINDOW_DAYS = 30;
  public static final int MAX_ROWS = 200;
  public static final int MIN_COUNT = 3;
  public static final double MIN_SHARE = 0.7;
  public static final int TOP_K = 5;

  private final ActivityRepository activityRepository;

  public HabitObserveService(ActivityRepository activityRepository) {
    this.activityRepository = activityRepository;
  }

  public Map<String, Object> observe(String familyId, List<Map<String, Object>> turnWrites) {
    long end = System.currentTimeMillis();
    long start = end - WINDOW_DAYS * 24L * 60L * 60L * 1000L;
    List<Map<String, Object>> creates = new ArrayList<>();
    List<Map<String, Object>> updates = new ArrayList<>();
    for (Map<String, Object> row :
        activityRepository.listByFamilyBetween(familyId, start, end + 1, "", MAX_ROWS)) {
      String action = str(row.get("action")).toLowerCase(Locale.ROOT);
      if ("create".equals(action)) {
        creates.add(row);
      } else if ("update".equals(action)) {
        updates.add(row);
      }
    }
    if (turnWrites != null) {
      for (Map<String, Object> w : turnWrites) {
        if (w == null) {
          continue;
        }
        String kind = str(w.get("kind")).toLowerCase(Locale.ROOT);
        if ("create".equals(kind)) {
          creates.add(w);
        } else if ("update".equals(kind)) {
          updates.add(w);
        }
      }
    }
    return aggregate(creates, updates);
  }

  /** Test/helper: aggregate only from turn write facts (no DB). */
  static Map<String, Object> aggregateFromWrites(List<Map<String, Object>> turnWrites) {
    List<Map<String, Object>> creates = new ArrayList<>();
    List<Map<String, Object>> updates = new ArrayList<>();
    if (turnWrites != null) {
      for (Map<String, Object> w : turnWrites) {
        if (w == null) {
          continue;
        }
        String kind = str(w.get("kind")).toLowerCase(Locale.ROOT);
        if ("create".equals(kind)) {
          creates.add(w);
        } else if ("update".equals(kind)) {
          updates.add(w);
        }
      }
    }
    return aggregate(creates, updates);
  }

  private static Map<String, Object> aggregate(
      List<Map<String, Object>> creates, List<Map<String, Object>> updates) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("windowDays", WINDOW_DAYS);
    out.put("createCount", creates.size());
    out.put("updateCount", updates.size());
    out.put("defaultSpaceCandidate", dominantSpace(creates));
    out.put("namePlaceTop", topNamePlaces(merge(creates, updates)));
    out.put("unitTop", topUnits(merge(creates, updates)));
    return out;
  }

  /** Compact note for soft replan (facts only, no commands). */
  public static String renderForModel(Map<String, Object> observe) {
    if (observe == null || observe.isEmpty()) {
      return "本轮习惯候选（统计）：无";
    }
    StringBuilder sb = new StringBuilder("本轮习惯候选（统计，供参考）：");
    @SuppressWarnings("unchecked")
    Map<String, Object> space = (Map<String, Object>) observe.get("defaultSpaceCandidate");
    if (space != null && !str(space.get("spaceName")).isEmpty()) {
      sb.append("\n- 默认落点候选：")
          .append(space.get("spaceName"))
          .append("（")
          .append(space.get("count"))
          .append('/')
          .append(space.get("total"))
          .append("，share=")
          .append(space.get("share"))
          .append(Boolean.TRUE.equals(space.get("strong")) ? "，strong" : "")
          .append('）');
    } else {
      sb.append("\n- 默认落点候选：无");
    }
    appendTop(sb, "同名常落点", observe.get("namePlaceTop"));
    appendTop(sb, "同名常单位", observe.get("unitTop"));
    return sb.toString();
  }

  @SuppressWarnings("unchecked")
  private static void appendTop(StringBuilder sb, String title, Object raw) {
    sb.append('\n').append("- ").append(title).append('：');
    if (!(raw instanceof List<?> list) || list.isEmpty()) {
      sb.append("无");
      return;
    }
    List<String> bits = new ArrayList<>();
    for (Object o : list) {
      if (!(o instanceof Map<?, ?> m)) {
        continue;
      }
      String name = str(m.get("name"));
      String place =
          joinPlace(str(m.get("spaceName")), str(m.get("locationName")));
      String unit = str(m.get("unit"));
      StringBuilder bit = new StringBuilder(name);
      if (!place.isEmpty()) {
        bit.append('@').append(place);
      }
      if (!unit.isEmpty()) {
        bit.append('×').append(unit);
      }
      bit.append('(')
          .append(m.get("count"))
          .append(Boolean.TRUE.equals(m.get("strong")) ? ",strong" : "")
          .append(')');
      bits.add(bit.toString());
    }
    sb.append(bits.isEmpty() ? "无" : String.join("；", bits));
  }

  private static Map<String, Object> dominantSpace(List<Map<String, Object>> creates) {
    Map<String, Integer> counts = new HashMap<>();
    int total = 0;
    for (Map<String, Object> row : creates) {
      String space = str(row.get("spaceName"));
      if (space.isEmpty()) {
        continue;
      }
      counts.merge(space, 1, Integer::sum);
      total++;
    }
    if (total == 0) {
      return Map.of("spaceName", "", "count", 0, "total", 0, "share", 0.0, "strong", false);
    }
    String best = "";
    int bestCount = 0;
    for (Map.Entry<String, Integer> e : counts.entrySet()) {
      if (e.getValue() > bestCount) {
        bestCount = e.getValue();
        best = e.getKey();
      }
    }
    double share = bestCount * 1.0 / total;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("spaceName", best);
    out.put("count", bestCount);
    out.put("total", total);
    out.put("share", Math.round(share * 1000) / 1000.0);
    out.put("strong", bestCount >= MIN_COUNT && share >= MIN_SHARE);
    return out;
  }

  private static List<Map<String, Object>> topNamePlaces(List<Map<String, Object>> rows) {
    Map<String, Counter> map = new HashMap<>();
    for (Map<String, Object> row : rows) {
      String rawName = str(row.get("itemName"));
      final String name = rawName.isEmpty() ? str(row.get("name")) : rawName;
      final String space = str(row.get("spaceName"));
      if (name.isEmpty() || space.isEmpty()) {
        continue;
      }
      final String loc = str(row.get("locationName"));
      String key = name + "\0" + space + "\0" + loc;
      Counter c = map.computeIfAbsent(key, k -> new Counter(name, space, loc));
      c.count++;
    }
    Map<String, Integer> nameTotals = new HashMap<>();
    for (Counter c : map.values()) {
      nameTotals.merge(c.name, c.count, Integer::sum);
    }
    List<Map<String, Object>> ranked = new ArrayList<>();
    for (Counter c : map.values()) {
      int total = nameTotals.getOrDefault(c.name, c.count);
      double share = c.count * 1.0 / Math.max(1, total);
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("name", c.name);
      row.put("spaceName", c.space);
      row.put("locationName", c.location);
      row.put("count", c.count);
      row.put("total", total);
      row.put("share", Math.round(share * 1000) / 1000.0);
      row.put("strong", c.count >= MIN_COUNT && share >= MIN_SHARE);
      ranked.add(row);
    }
    ranked.sort(Comparator.comparingInt((Map<String, Object> m) -> (Integer) m.get("count")).reversed());
    return ranked.size() > TOP_K ? ranked.subList(0, TOP_K) : ranked;
  }

  private static List<Map<String, Object>> topUnits(List<Map<String, Object>> rows) {
    Map<String, UnitCounter> map = new HashMap<>();
    for (Map<String, Object> row : rows) {
      String rawName = str(row.get("itemName"));
      final String name = rawName.isEmpty() ? str(row.get("name")) : rawName;
      final String unit = str(row.get("unit"));
      if (name.isEmpty() || unit.isEmpty()) {
        continue;
      }
      String key = name + "\0" + unit;
      UnitCounter c = map.computeIfAbsent(key, k -> new UnitCounter(name, unit));
      c.count++;
    }
    Map<String, Integer> nameTotals = new HashMap<>();
    for (UnitCounter c : map.values()) {
      nameTotals.merge(c.name, c.count, Integer::sum);
    }
    List<Map<String, Object>> ranked = new ArrayList<>();
    for (UnitCounter c : map.values()) {
      int total = nameTotals.getOrDefault(c.name, c.count);
      double share = c.count * 1.0 / Math.max(1, total);
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("name", c.name);
      row.put("unit", c.unit);
      row.put("count", c.count);
      row.put("total", total);
      row.put("share", Math.round(share * 1000) / 1000.0);
      row.put("strong", c.count >= MIN_COUNT && share >= MIN_SHARE);
      ranked.add(row);
    }
    ranked.sort(Comparator.comparingInt((Map<String, Object> m) -> (Integer) m.get("count")).reversed());
    return ranked.size() > TOP_K ? ranked.subList(0, TOP_K) : ranked;
  }

  private static List<Map<String, Object>> merge(
      List<Map<String, Object>> a, List<Map<String, Object>> b) {
    List<Map<String, Object>> out = new ArrayList<>(a.size() + b.size());
    out.addAll(a);
    out.addAll(b);
    return out;
  }

  private static String joinPlace(String space, String loc) {
    if (space.isEmpty()) {
      return loc;
    }
    if (loc.isEmpty()) {
      return space;
    }
    return space + "/" + loc;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }

  private static final class Counter {
    final String name;
    final String space;
    final String location;
    int count;

    Counter(String name, String space, String location) {
      this.name = name;
      this.space = space;
      this.location = location;
    }
  }

  private static final class UnitCounter {
    final String name;
    final String unit;
    int count;

    UnitCounter(String name, String unit) {
      this.name = name;
      this.unit = unit;
    }
  }
}
