package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ToolSchemasTest {

  @Test
  void functionNameRoundTripsCapabilityId() {
    assertEquals("item_search", ToolSchemas.functionName("item.search"));
    assertEquals("item.search", ToolSchemas.capabilityId("item_search"));
    assertEquals("item_createMany", ToolSchemas.functionName("item.createMany"));
    assertEquals("habit.upsert", ToolSchemas.capabilityId("habit_upsert"));
  }

  @Test
  void toolsOmitHardDenyAndMarkRequiredArgs() {
    Map<String, Object> search = new LinkedHashMap<>();
    search.put("id", "item.search");
    search.put("enabled", true);
    search.put("confirm", false);
    search.put("hint", "只读列出物资");
    search.put("args", "name?, spaceName?");
    Map<String, Object> dissolve = new LinkedHashMap<>();
    dissolve.put("id", "family.dissolve");
    dissolve.put("enabled", true);
    dissolve.put("hint", "解散");
    dissolve.put("args", "");
    Map<String, Map<String, Object>> catalog = new LinkedHashMap<>();
    catalog.put("item.search", search);
    catalog.put("family.dissolve", dissolve);

    ArrayNode tools = ToolSchemas.openAiTools(new ObjectMapper(), catalog);
    String blob = tools.toString();
    assertTrue(blob.contains("item_search"));
    assertTrue(blob.contains("\"name\":\"ask\""));
    assertTrue(blob.contains("\"name\":\"present\""));
    assertFalse(blob.contains("family_dissolve"));
    assertFalse(blob.contains("\"required\":[\"name\"]"));
  }

  @Test
  void nestedArgsStayInsideTheArrayField() {
    Map<String, Object> createMany = new LinkedHashMap<>();
    createMany.put("id", "item.createMany");
    createMany.put("enabled", true);
    createMany.put("confirm", false);
    createMany.put("hint", "一次新建");
    createMany.put(
        "args",
        "items[{ name, quantity?, unit?, spaceName, locationName?, tagNames?, expireDate?, productionDate?, note? }]");
    Map<String, Object> removeMany = new LinkedHashMap<>();
    removeMany.put("id", "tag.removeMany");
    removeMany.put("enabled", true);
    removeMany.put("confirm", true);
    removeMany.put("hint", "一次删标签");
    removeMany.put("args", "names[] 或 tags[{ name }]");
    Map<String, Map<String, Object>> catalog = new LinkedHashMap<>();
    catalog.put("item.createMany", createMany);
    catalog.put("tag.removeMany", removeMany);

    ArrayNode tools = ToolSchemas.openAiTools(new ObjectMapper(), catalog);
    JsonNode create = findTool(tools, "item_createMany");
    JsonNode required = create.path("function").path("parameters").path("required");
    assertEquals(1, required.size());
    assertEquals("items", required.get(0).asText());
    assertFalse(create.path("function").path("parameters").path("properties").has("spaceName"));

    JsonNode remove = findTool(tools, "tag_removeMany");
    assertEquals(
        "string",
        remove.path("function").path("parameters").path("properties").path("names").path("items").path("type").asText());
    assertFalse(remove.path("function").path("parameters").path("properties").has("name"));
  }

  @Test
  void srcArgBecomesAnObjectWithOriginEnum() {
    Map<String, Object> update = new LinkedHashMap<>();
    update.put("id", "item.update");
    update.put("enabled", true);
    update.put("confirm", false);
    update.put("hint", "改已有物资");
    update.put("args", "ref, spaceName?, quantity?, _src?");
    Map<String, Map<String, Object>> catalog = new LinkedHashMap<>();
    catalog.put("item.update", update);

    ArrayNode tools = ToolSchemas.openAiTools(new ObjectMapper(), catalog);
    JsonNode tool = findTool(tools, "item_update");
    JsonNode params = tool.path("function").path("parameters");
    JsonNode src = params.path("properties").path("_src");
    assertEquals("object", src.path("type").asText());
    JsonNode origins = src.path("additionalProperties").path("properties").path("from").path("enum");
    assertEquals("inference", origins.get(2).asText());
    for (JsonNode name : params.path("required")) {
      assertFalse("_src".equals(name.asText()));
    }
  }

  private static JsonNode findTool(ArrayNode tools, String name) {
    for (JsonNode tool : tools) {
      if (name.equals(tool.path("function").path("name").asText())) {
        return tool;
      }
    }
    throw new AssertionError("missing tool " + name);
  }
}
