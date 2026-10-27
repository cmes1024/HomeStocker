package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AttachExecutedReceiptTest {

  @Test
  void confirmPayloadCarriesWhatAlreadyRan() {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "confirm");
    payload.put("calls", List.of(Map.of("use", "item.remove")));

    Map<String, Object> report = new LinkedHashMap<>();
    report.put("wrote", true);
    report.put(
        "executed", List.of(Map.of("step", 1, "use", "item.update", "summary", "已改 苹果 3个")));

    AiActService.attachExecutedReceipt(payload, report, List.of());

    assertEquals(1, ((List<?>) payload.get("executed")).size());
    assertEquals("item.remove", ((Map<?, ?>) ((List<?>) payload.get("calls")).get(0)).get("use"));
  }

  @Test
  void nothingRanMeansNoExecutedField() {
    Map<String, Object> payload = new LinkedHashMap<>();
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("wrote", false);
    report.put("executed", List.of());

    AiActService.attachExecutedReceipt(payload, report, List.of());

    assertNull(payload.get("executed"));
  }
}
