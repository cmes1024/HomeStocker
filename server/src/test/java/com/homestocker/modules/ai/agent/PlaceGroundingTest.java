package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
  void knownSpaceAndLocationPass() {
    assertNull(PlaceGrounding.one(tree, "厨房", "橱柜", true));
    assertNull(PlaceGrounding.one(tree, "客厅", "", true));
  }

  @Test
  void unknownSpaceIsRejectedWithCandidateSpaces() {
    ToolFeedback why = PlaceGrounding.one(tree, "阳台", "", true);
    assertEquals(GroundingCodes.PLACE_UNGROUNDED, why.code());
    assertEquals("spaceName", why.field());
    assertEquals("阳台", why.given());
    assertTrue(why.candidates().contains("厨房"));
  }

  @Test
  void unknownLocationIsRejectedWithShelfCandidates() {
    ToolFeedback why = PlaceGrounding.one(tree, "客厅", "门口", true);
    assertEquals(GroundingCodes.PLACE_UNGROUNDED, why.code());
    assertEquals("locationName", why.field());
    assertEquals("门口", why.given());
    assertEquals(List.of("零食柜"), why.candidates());
  }

  @Test
  void createNeedsASpaceButUpdateDoesNot() {
    assertEquals(
        GroundingCodes.PLACE_UNGROUNDED, PlaceGrounding.one(tree, "", "", true).code());
    assertNull(PlaceGrounding.one(tree, "", "", false));
  }

  @Test
  void noPlaceAtAllReturnsExistingSpacesAsCandidates() {
    ToolFeedback why = PlaceGrounding.one(tree, "", "", true);
    assertEquals(GroundingCodes.PLACE_UNGROUNDED, why.code());
    assertEquals("spaceName", why.field());
    assertEquals(List.of("厨房", "客厅"), why.candidates());
  }
}
