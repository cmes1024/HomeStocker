package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.LinkedHashMap;
import java.util.List;
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

  @Test
  void structuredParamsCarryEnumRangeAndObjectArrayFields() {
    Map<String, Object> tagged = new LinkedHashMap<>();
    tagged.put("name", "tagged");
    tagged.put("type", "string");
    tagged.put("enum", List.of("any", "untagged"));
    tagged.put("description", "any=不限；untagged=只列没挂标签的");
    Map<String, Object> quantity = new LinkedHashMap<>();
    quantity.put("name", "quantity");
    quantity.put("type", "number");
    quantity.put("exclusiveMinimum", 0);

    Map<String, Object> groupName = new LinkedHashMap<>();
    groupName.put("name", "name");
    groupName.put("type", "string");
    groupName.put("required", true);
    Map<String, Object> groupTags = new LinkedHashMap<>();
    groupTags.put("name", "tagNames");
    groupTags.put("type", "array");
    groupTags.put("items", "string");
    Map<String, Object> groups = new LinkedHashMap<>();
    groups.put("name", "itemGroups");
    groups.put("type", "array");
    groups.put("required", true);
    groups.put("items", List.of(groupName, groupTags));

    Map<String, Object> search = new LinkedHashMap<>();
    search.put("id", "item.search");
    search.put("enabled", true);
    search.put("confirm", false);
    search.put("hint", "只读列出物资");
    search.put("args", "tagged?, itemGroups[{ name, tagNames? }]");
    search.put("params", List.of(tagged, quantity, groups));
    Map<String, Map<String, Object>> catalog = new LinkedHashMap<>();
    catalog.put("item.search", search);

    ArrayNode tools = ToolSchemas.openAiTools(new ObjectMapper(), catalog);
    JsonNode params = findTool(tools, "item_search").path("function").path("parameters");

    assertEquals("untagged", params.path("properties").path("tagged").path("enum").get(1).asText());
    assertEquals(
        0d, params.path("properties").path("quantity").path("exclusiveMinimum").asDouble());
    JsonNode groupItem = params.path("properties").path("itemGroups").path("items");
    assertEquals("object", groupItem.path("type").asText());
    assertEquals("name", groupItem.path("required").get(0).asText());
    assertEquals(
        "string",
        groupItem.path("properties").path("tagNames").path("items").path("type").asText());
    assertEquals(1, params.path("required").size());
    assertEquals("itemGroups", params.path("required").get(0).asText());
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
