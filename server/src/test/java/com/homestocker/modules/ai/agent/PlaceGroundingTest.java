package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PlaceGroundingTest {

  private final Map<String, Object> tree =
      Map.of(
          "spaces",
          List.of(
              Map.of("name", "厨房", "locations", List.of(Map.of("name", "冰箱"), Map.of("name", "橱柜"))),
              Map.of("name", "客厅", "locations", List.of(Map.of("name", "零食柜")))));

  @Test
  void vinegarCannotPickAKitchenShelf() {
    String why = PlaceGrounding.one("记一瓶醋", "", tree, "厨房", "橱柜");
    assertTrue(why.contains("厨房"));
  }

  @Test
  void doorDoesNotInventTheLivingRoom() {
    String why = PlaceGrounding.one("门口放一包口罩", "", tree, "客厅", "门口");
    assertTrue(why.contains("客厅") || why.contains("门口"));
  }

  @Test
  void namedPlaceAndExistingShelfAreKept() {
    assertNull(PlaceGrounding.one("厨房橱柜记两包泡面", "", tree, "厨房", "橱柜"));
    assertNull(PlaceGrounding.one("放冰箱", "", tree, "厨房", "冰箱"));
    assertNull(PlaceGrounding.one("客厅记一盒口罩", "", tree, "客厅", ""));
  }

  @Test
  void habitDefaultSpaceCanFillWhenTheSentenceHasNoPlace() {
    assertNull(PlaceGrounding.one("记一瓶醋", "厨房", tree, "厨房", ""));
  }
}
