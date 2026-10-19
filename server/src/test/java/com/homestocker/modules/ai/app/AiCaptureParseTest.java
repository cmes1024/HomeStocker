package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AiCaptureParseTest {

  private static final ObjectMapper OM = new ObjectMapper();

  @Test
  void parsesWellFormedFields() {
    Map<String, Object> fields =
        AiCaptureService.parseFields(
            OM,
            "{\"name\":\" 纯牛奶 \",\"quantity\":2,\"unit\":\"瓶\",\"note\":\"促销装\","
                + "\"productionDate\":\"2026-09-01\",\"expireDate\":\"2026-12-01\"}");
    assertEquals("纯牛奶", fields.get("name"));
    assertEquals(2L, fields.get("quantity"));
    assertEquals("瓶", fields.get("unit"));
    assertEquals("促销装", fields.get("note"));
    assertEquals("2026-09-01", fields.get("productionDate"));
    assertEquals("2026-12-01", fields.get("expireDate"));
  }

  @Test
  void parsesJsonInsideFence() {
    Map<String, Object> fields =
        AiCaptureService.parseFields(OM, "```json\n{\"name\":\"酱油\",\"quantity\":1}\n```");
    assertEquals("酱油", fields.get("name"));
    assertEquals(1L, fields.get("quantity"));
  }

  @Test
  void badJsonThrows() {
    assertThrows(
        IllegalArgumentException.class, () -> AiCaptureService.parseFields(OM, "我看不清这张图"));
  }

  @Test
  void nullOrArrayRootThrows() {
    assertThrows(
        IllegalArgumentException.class, () -> AiCaptureService.parseFields(OM, "null"));
    assertThrows(
        IllegalArgumentException.class, () -> AiCaptureService.parseFields(OM, "[1,2,3]"));
  }

  @Test
  void garbageValuesAreDroppedNotFatal() {
    Map<String, Object> fields =
        AiCaptureService.parseFields(
            OM,
            "{\"name\":\"牛奶\",\"quantity\":\"两瓶\",\"expireDate\":\"下周三\","
                + "\"productionDate\":\"1999-01-01\"}");
    assertEquals("牛奶", fields.get("name"));
    assertTrue(!fields.containsKey("quantity"));
    assertTrue(!fields.containsKey("expireDate"));
    // 早于 2000 年的日期视为不可信
    assertTrue(!fields.containsKey("productionDate"));
  }

  @Test
  void fractionalQuantityRoundsToLong() {
    Map<String, Object> fields =
        AiCaptureService.parseFields(OM, "{\"name\":\"大米\",\"quantity\":0.5}");
    assertEquals(1L, fields.get("quantity"));
    Map<String, Object> two = AiCaptureService.parseFields(OM, "{\"quantity\":2.4}");
    assertEquals(2L, two.get("quantity"));
  }

  @Test
  void negativeOrNaNDropped() {
    assertTrue(!AiCaptureService.parseFields(OM, "{\"quantity\":-3}").containsKey("quantity"));
    assertTrue(!AiCaptureService.parseFields(OM, "{\"quantity\":\"abc\"}").containsKey("quantity"));
  }

  @Test
  void farFutureDateDropped() {
    String far = "{\"expireDate\":\"2099-01-01\"}";
    assertTrue(!AiCaptureService.parseFields(OM, far).containsKey("expireDate"));
  }

  @Test
  void longTextIsCapped() {
    String longName = "牛".repeat(200);
    Map<String, Object> fields =
        AiCaptureService.parseFields(OM, "{\"name\":\"" + longName + "\"}");
    assertEquals(60, ((String) fields.get("name")).length());
  }

  @Test
  void emptyOrMissingFieldsSimplyAbsent() {
    Map<String, Object> fields =
        AiCaptureService.parseFields(OM, "{\"name\":\"\",\"quantity\":null,\"unit\":\"  \"}");
    assertTrue(fields.isEmpty());
  }

  @Test
  void normalizeDataUrlEnforcesShape() {
    String tiny = "data:image/jpeg;base64,QUJD";
    assertEquals(tiny, AiCaptureService.normalizeDataUrl(tiny));
    assertEquals(tiny, AiCaptureService.normalizeDataUrl("  " + tiny + "  \n"));
    // jpg 归一为 jpeg
    assertEquals(
        "data:image/jpeg;base64,QUJD",
        AiCaptureService.normalizeDataUrl("data:image/jpg;base64,QUJD"));
    // 带换行的 base64 体去空白
    assertEquals(
        "data:image/png;base64,QUJD",
        AiCaptureService.normalizeDataUrl("data:image/png;base64,QU\r\nJD"));
    // 非 base64 data URL / 空 / http URL 一律拒绝
    assertEquals("", AiCaptureService.normalizeDataUrl("https://example.com/a.jpg"));
    assertEquals("", AiCaptureService.normalizeDataUrl("data:image/jpeg,rawbytes"));
    assertEquals("", AiCaptureService.normalizeDataUrl(null));
    assertEquals("", AiCaptureService.normalizeDataUrl(""));
  }

  @Test
  void buildMessagesHasSystemTextAndImageParts() {
    ArrayNode messages =
        AiCaptureService.buildMessages(OM, "帮我看这箱奶", null, "data:image/jpeg;base64,QUJD", false);
    assertEquals(2, messages.size());
    JsonNode system = messages.get(0);
    assertEquals("system", system.get("role").asText());
    assertTrue(system.get("content").asText().contains("YYYY-MM-DD"));
    JsonNode user = messages.get(1);
    assertEquals("user", user.get("role").asText());
    JsonNode parts = user.get("content");
    assertTrue(parts.isArray());
    assertEquals(2, parts.size());
    assertEquals("text", parts.get(0).get("type").asText());
    assertEquals("帮我看这箱奶", parts.get(0).get("text").asText());
    assertEquals("image_url", parts.get(1).get("type").asText());
    assertEquals(
        "data:image/jpeg;base64,QUJD",
        parts.get(1).get("image_url").get("url").asText());
  }

  @Test
  void repairAddsNoteToTextPart() {
    ArrayNode messages =
        AiCaptureService.buildMessages(OM, "", null, "data:image/jpeg;base64,QUJD", true);
    String text = messages.get(1).get("content").get(0).get("text").asText();
    assertTrue(text.contains("请抽取这张照片里物资的字段。"));
    assertTrue(text.contains("上轮输出不是合法 JSON"));
  }

  @Test
  void normalizeContextKeepsOnlyValidContractFields() {
    Map<String, Object> raw =
        Map.of(
            "name", "  纯牛奶  ",
            "quantity", "2",
            "unit", "瓶",
            "note", "",
            "productionDate", "2026-09-01",
            "expireDate", "下周三",
            "spaceId", "space-1",
            "tagIds", List.of("tag-1"));
    Map<String, Object> ctx = AiCaptureService.normalizeContext(OM, raw);
    assertEquals("纯牛奶", ctx.get("name"));
    assertEquals(2L, ctx.get("quantity"));
    assertEquals("瓶", ctx.get("unit"));
    // 空值、非法日期、契约外字段一律不带入
    assertTrue(!ctx.containsKey("note"));
    assertTrue(!ctx.containsKey("expireDate"));
    assertTrue(!ctx.containsKey("spaceId"));
    assertTrue(!ctx.containsKey("tagIds"));
    assertEquals("2026-09-01", ctx.get("productionDate"));
  }

  @Test
  void normalizeContextRejectsNonMapAndBadValues() {
    assertTrue(AiCaptureService.normalizeContext(OM, null).isEmpty());
    assertTrue(AiCaptureService.normalizeContext(OM, "not-a-map").isEmpty());
    Map<String, Object> ctx =
        AiCaptureService.normalizeContext(
            OM, Map.of("quantity", -3, "productionDate", "1999-01-01", "unit", "  "));
    assertTrue(ctx.isEmpty());
  }

  @Test
  void buildMessagesAppendsContextLineForModelArbitration() {
    Map<String, Object> ctx =
        AiCaptureService.normalizeContext(
            OM,
            Map.of(
                "name",
                "纯牛奶",
                "quantity",
                1,
                "unit",
                "瓶",
                "expireDate",
                "2026-12-01"));
    ArrayNode messages =
        AiCaptureService.buildMessages(OM, "", ctx, "data:image/jpeg;base64,QUJD", false);
    String text = messages.get(1).get("content").get(0).get("text").asText();
    assertTrue(text.contains("当前表单"));
    assertTrue(text.contains("name「纯牛奶」"));
    assertTrue(text.contains("quantity 1"));
    assertTrue(text.contains("expireDate「2026-12-01」"));
    // 空表单不带上下文行
    ArrayNode bare =
        AiCaptureService.buildMessages(OM, "", Map.of(), "data:image/jpeg;base64,QUJD", false);
    String bareText = bare.get(1).get("content").get(0).get("text").asText();
    assertTrue(!bareText.contains("当前表单"));
  }

  @Test
  void promptContractHasNoKeywordRoutingTalk() {
    String prompt = AiCaptureService.CAPTURE_SYSTEM_PROMPT;
    // 只抽字段、禁编造、日期归一、模型仲裁——且不存在「说 xxx 就做 xxx」式话术
    assertTrue(prompt.contains("禁止猜测、禁止编造"));
    assertTrue(prompt.contains("YYYY-MM-DD"));
    assertTrue(prompt.contains("当前表单"));
    assertTrue(prompt.contains("裁决规则"));
    assertTrue(!prompt.contains("item.create"));
    assertTrue(!prompt.contains("调用"));
  }
}
