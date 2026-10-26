package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PresentSpecTest {

  @Test
  void synonymousTypesAreCoerced() {
    assertEquals("table", typeOf(args("type", "list")));
    assertEquals("table", typeOf(args("type", "清单")));
    assertEquals("bars", typeOf(args("type", "chart")));
    assertEquals("bars", typeOf(args("type", "bar")));
    assertEquals("stats", typeOf(args("type", "统计")));
    assertEquals("stats", typeOf(args("type", "count")));
    assertEquals("pie", typeOf(args("type", "donut")));
  }

  @Test
  void missingTypeIsInferredFromShape() {
    Map<String, Object> grouped = args("groupBy", "space");
    assertEquals("stats", typeOf(grouped));

    Map<String, Object> withColumns = args("columns", List.of("名称", "数量"));
    assertEquals("table", typeOf(withColumns));

    Map<String, Object> withItems = args("items", List.of(Map.of("label", "厨房", "value", 3)));
    assertEquals("stats", typeOf(withItems));
  }

  @Test
  void unknownTypeAndEmptyArgsAreRejected() {
    assertNull(ActToolLoop.presentSpec(args("type", "nonsense")));
    assertNull(ActToolLoop.presentSpec(new LinkedHashMap<>()));
    assertNull(ActToolLoop.presentSpec(null));
  }

  @Test
  void presentTypeDeclaresEnum() {
    ArrayNode tools = ToolSchemas.openAiTools(new ObjectMapper(), null);
    JsonNode typeNode = null;
    for (JsonNode tool : tools) {
      if (ToolSchemas.PRESENT.equals(tool.path("function").path("name").asText())) {
        typeNode = tool.path("function").path("parameters").path("properties").path("type");
      }
    }
    assertNotNull(typeNode);
    JsonNode types = typeNode.path("enum");
    assertEquals(4, types.size());
  }

  private static String typeOf(Map<String, Object> args) {
    Map<String, Object> spec = ActToolLoop.presentSpec(args);
    assertNotNull(spec, "spec 不该为 null: " + args);
    return String.valueOf(spec.get("type"));
  }

  private static Map<String, Object> args(String key, Object value) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put(key, value);
    return map;
  }
}
