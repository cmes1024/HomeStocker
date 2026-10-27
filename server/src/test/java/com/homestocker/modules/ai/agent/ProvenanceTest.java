package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ProvenanceTest {

  private static final List<Map<String, Object>> ROWS =
      List.of(
          Map.of(
              "ref", "P1",
              "itemId", "a",
              "name", "保鲜膜",
              "quantity", new BigDecimal("1"),
              "spaceName", "厨房",
              "locationName", "橱柜"));

  @Test
  void callWithoutSourceIsNotChecked() {
    assertNull(
        Provenance.verify(
            "记一瓶醋", "", Map.of("use", "item.create", "spaceName", "厨房"), ROWS));
    assertEquals(List.of("spaceName"), Provenance.missingFields(Map.of("spaceName", "厨房")));
  }

  @Test
  void quotedPlacePassesWhenTheWordsAreInTheGroundText() {
    Map<String, Object> call =
        Provenance.withSource(
            Map.of("use", "item.create", "spaceName", "厨房"),
            Map.of("spaceName", Map.of("from", "user", "quote", "放厨房")));
    assertNull(Provenance.verify("放厨房吧", "", call, ROWS));
  }

  @Test
  void quotedPlaceFailsWhenTheQuoteIsNotInTheGroundText() {
    Map<String, Object> call =
        Provenance.withSource(
            Map.of("use", "item.create", "spaceName", "厨房"),
            Map.of("spaceName", Map.of("from", "user", "quote", "放阳台")));
    ToolFeedback why = Provenance.verify("放厨房吧", "", call, ROWS);
    assertEquals(GroundingCodes.PLACE_UNGROUNDED, why.code());
    assertEquals("spaceName", why.field());
    assertEquals("user", why.declared());
  }

  @Test
  void probeValueMustMatchTheRowItNames() {
    Map<String, Object> ok =
        Provenance.withSource(
            Map.of("use", "item.update", "spaceName", "厨房"),
            Map.of("spaceName", Map.of("from", "probe", "via", "P1")));
    assertNull(Provenance.verify("", "", ok, ROWS));

    Map<String, Object> bad =
        Provenance.withSource(
            Map.of("use", "item.update", "spaceName", "客厅"),
            Map.of("spaceName", Map.of("from", "probe", "via", "P1")));
    ToolFeedback why = Provenance.verify("", "", bad, ROWS);
    assertEquals(GroundingCodes.PLACE_UNGROUNDED, why.code());
    assertEquals("probe", why.declared());
  }

  @Test
  void probeWithUnknownRefFails() {
    Map<String, Object> call =
        Provenance.withSource(
            Map.of("use", "item.update", "quantity", 2),
            Map.of("quantity", Map.of("from", "probe", "via", "P9")));
    assertEquals(GroundingCodes.QTY_UNGROUNDED, Provenance.verify("", "", call, ROWS).code());
  }

  @Test
  void inferenceOnlyNeedsAnExistingBasis() {
    Map<String, Object> ok =
        Provenance.withSource(
            Map.of("use", "item.update", "locationName", "橱柜"),
            Map.of("locationName", Map.of("from", "inference", "via", "P1")));
    assertNull(Provenance.verify("再买一卷", "", ok, ROWS));

    Map<String, Object> noBasis =
        Provenance.withSource(
            Map.of("use", "item.update", "locationName", "橱柜"),
            Map.of("locationName", Map.of("from", "inference")));
    ToolFeedback why = Provenance.verify("再买一卷", "", noBasis, ROWS);
    assertEquals(GroundingCodes.INFERENCE_NO_BASIS, why.code());
  }

  @Test
  void habitOriginMustMatchTheStoredSlot() {
    Map<String, Object> call =
        Provenance.withSource(
            Map.of("use", "item.create", "spaceName", "厨房"),
            Map.of("spaceName", Map.of("from", "habit")));
    assertNull(Provenance.verify("记一瓶醋", "厨房", call, ROWS));
    assertEquals(
        GroundingCodes.PLACE_UNGROUNDED, Provenance.verify("记一瓶醋", "客厅", call, ROWS).code());
  }

  @Test
  void defaultOriginAlwaysPasses() {
    Map<String, Object> call =
        Provenance.withSource(
            Map.of("use", "item.create", "spaceName", "仓库"),
            Map.of("spaceName", Map.of("from", "default")));
    assertNull(Provenance.verify("记一瓶醋", "", call, ROWS));
  }

  @Test
  void inferredRefGetsAConfirmationNote() {
    Map<String, Object> call =
        Provenance.withSource(
            Map.of("use", "item.remove", "ref", "P1"),
            Map.of("ref", Map.of("from", "inference", "via", "P2")));
    assertTrue(Provenance.inferredRefNote(call).contains("依据 P2"));
    assertEquals("", Provenance.inferredRefNote(Map.of("use", "item.remove", "ref", "P1")));
  }
}
