package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ActRefsLookupTest {

  @Test
  void quantitySuffixBindsTheOnlyRow() {
    Map<String, Object> apple = row("P1", "i1", "苹果", "冰箱", "");
    Map<String, Object> hit =
        ActRefs.lookupRef(Map.of("use", "item.update", "name", "苹果 2斤"), refs(apple));
    assertEquals("i1", hit.get("itemId"));
  }

  @Test
  void sameNameNeedsSourcePlace() {
    Map<String, Object> fridge = row("P1", "i1", "苹果", "冰箱", "");
    Map<String, Object> kitchen = row("P2", "i2", "苹果", "厨房", "冷藏");
    Map<String, Map<String, Object>> refs = refs(fridge, kitchen);

    assertNull(ActRefs.lookupRef(Map.of("name", "苹果 2斤"), refs));
    assertEquals("i1", ActRefs.lookupRef(Map.of("name", "苹果（冰箱）"), refs).get("itemId"));
    assertEquals(
        "i1",
        ActRefs.lookupRef(Map.of("name", "苹果", "fromSpaceName", "冰箱"), refs).get("itemId"));
    assertNull(ActRefs.lookupRef(Map.of("name", "苹果", "spaceName", "厨房"), refs));
  }

  @Test
  void placeThatMatchesSpaceAndLocationStaysAmbiguous() {
    Map<String, Object> spaceFridge = row("P1", "i1", "苹果", "冰箱", "");
    Map<String, Object> kitchenFridge = row("P2", "i2", "苹果", "厨房", "冰箱");
    assertNull(
        ActRefs.lookupRef(Map.of("name", "苹果（冰箱）"), refs(spaceFridge, kitchenFridge)));
  }

  @Test
  void placeHintDoesNotBindADifferentRow() {
    Map<String, Object> warehouse = row("P1", "i1", "苹果", "仓库", "");
    assertNull(ActRefs.lookupRef(Map.of("name", "苹果（冰箱）"), refs(warehouse)));
  }

  @Test
  void longerNameDoesNotMatchPrefix() {
    Map<String, Object> apple = row("P1", "i1", "苹果", "冰箱", "");
    assertNull(ActRefs.lookupRef(Map.of("name", "苹果汁"), refs(apple)));
    Map<String, Object> vitamin = row("P2", "i2", "维生素B", "冰箱", "");
    assertNull(ActRefs.lookupRef(Map.of("name", "维生素B12"), refs(vitamin)));
    assertEquals("维生素B12", ActRefs.itemNameCore("维生素B12"));
    assertEquals("苹果", ActRefs.itemNameCore("苹果2斤（冰箱）"));
  }

  private static Map<String, Object> row(
      String ref, String itemId, String name, String spaceName, String locationName) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("ref", ref);
    row.put("itemId", itemId);
    row.put("name", name);
    row.put("quantity", 2);
    row.put("unit", "斤");
    row.put("spaceName", spaceName);
    row.put("locationName", locationName);
    return row;
  }

  private static Map<String, Map<String, Object>> refs(Map<String, Object>... rows) {
    Map<String, Map<String, Object>> refs = new LinkedHashMap<>();
    for (Map<String, Object> row : rows) {
      refs.put(String.valueOf(row.get("ref")), row);
    }
    return refs;
  }
}
