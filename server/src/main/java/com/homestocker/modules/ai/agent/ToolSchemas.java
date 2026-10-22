package com.homestocker.modules.ai.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.homestocker.modules.ai.app.CapabilityCatalog;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 能力 id 与 OpenAI tools 函数名的对应。函数名不能带点。 */
public final class ToolSchemas {

  public static final String ASK = "ask";
  public static final String PRESENT = "present";
  public static final int MAX_STEPS = 4;

  private ToolSchemas() {}

  public static String functionName(String capabilityId) {
    String id = capabilityId == null ? "" : capabilityId.trim();
    int dot = id.indexOf('.');
    if (dot <= 0 || dot == id.length() - 1) {
      return id;
    }
    return id.substring(0, dot) + "_" + id.substring(dot + 1);
  }

  public static String capabilityId(String functionName) {
    String name = functionName == null ? "" : functionName.trim();
    int underscore = name.indexOf('_');
    if (underscore <= 0 || underscore == name.length() - 1) {
      return name;
    }
    return name.substring(0, underscore) + "." + name.substring(underscore + 1);
  }

  public static ArrayNode openAiTools(ObjectMapper mapper, Map<String, Map<String, Object>> catalog) {
    ArrayNode tools = mapper.createArrayNode();
    tools.add(askTool(mapper));
    tools.add(presentTool(mapper));
    if (catalog == null) {
      return tools;
    }
    for (Map<String, Object> api : catalog.values()) {
      if (api == null) {
        continue;
      }
      String id = String.valueOf(api.get("id") == null ? "" : api.get("id")).trim();
      if (id.isEmpty() || CapabilityCatalog.isHardDenied(id)) {
        continue;
      }
      if (api.get("enabled") != null && !Boolean.TRUE.equals(api.get("enabled"))) {
        continue;
      }
      tools.add(capabilityTool(mapper, api, id));
    }
    return tools;
  }

  private static ObjectNode askTool(ObjectMapper mapper) {
    ObjectNode tool = mapper.createObjectNode();
    tool.put("type", "function");
    ObjectNode fn = tool.putObject("function");
    fn.put("name", ASK);
    fn.put("description", "要给家人点选项时才调用，问清还没对齐的对象、数量或落点。只是问一句就直接说，不要编选项。调用后本轮结束，不要同时改台账。");
    ObjectNode params = fn.putObject("parameters");
    params.put("type", "object");
    ObjectNode props = params.putObject("properties");
    props.putObject("question").put("type", "string").put("description", "问家人的那一句");
    props.putObject("options").put("type", "array").putObject("items").put("type", "string");
    params.putArray("required").add("question");
    return tool;
  }

  /** 只决定怎么画已经查到的结果，不写台账，也不能自带格子。 */
  private static ObjectNode presentTool(ObjectMapper mapper) {
    ObjectNode tool = mapper.createObjectNode();
    tool.put("type", "function");
    ObjectNode fn = tool.putObject("function");
    fn.put("name", PRESENT);
    fn.put(
        "description",
        "把本轮已经查到的物资行画给家人。type 用 table、stats、bars 或 pie。对比或占比用 bars 或 pie，并带 groupBy（space、tag、location 或 name）。table 的列由你决定：字段列的值由服务端按 key 取，不要自己写数字；说明列由你在 notes 里逐行写，放差异、状态、来源、提醒等事实，不给饮食、健康、购买、处理建议。不要自己编数字。");
    ObjectNode params = fn.putObject("parameters");
    params.put("type", "object");
    ObjectNode props = params.putObject("properties");
    props.putObject("type").put("type", "string").put("description", "table、stats、bars 或 pie");
    props.putObject("groupBy").put("type", "string").put("description", "space、tag、location 或 name");
    props.putObject("title").put("type", "string").put("description", "表上方短标题，不超过 24 字");
    ObjectNode cols = props.putObject("columns");
    cols.put("type", "array");
    cols.put(
        "description",
        "仅 table：列出要展示的列。字段列 {\"key\":\"name|quantity|place|space|expire|production\",\"label\":\"名称\",\"width\":1-5}，值由服务端取；说明列 {\"label\":\"说明\",\"text\":true,\"width\":1-5}，内容在 notes 里逐行给。也可简写 [\"名称\",\"数量\",\"位置\",\"备注\"]（备注=说明列）。最多 5 列，数量列建议 width 1。");
    cols.putObject("items").put("type", "object");
    ObjectNode notes = props.putObject("notes");
    notes.put("type", "array");
    notes.put(
        "description",
        "仅 table：说明列每行的文字，用本轮短号绑定，如 [{\"ref\":\"P1\",\"text\":\"红苹果\"}]。只写其它列没有的事实（品种、来源、状态、到期等），不要复述名称、数量、位置，不要写「没写/未填/无/未知」这类空缺说明；这行没有额外事实就不传这段，该格留空。不编数字，不给建议。");
    ObjectNode noteItem = notes.putObject("items");
    noteItem.put("type", "object");
    ObjectNode noteProps = noteItem.putObject("properties");
    noteProps.putObject("ref").put("type", "string");
    noteProps.putObject("text").put("type", "string");
    props.putObject("caption")
        .put("type", "string")
        .put("description", "仅 table：表下一句事实（跨行归纳或状态），不超过 60 字，不给建议");
    params.putArray("required").add("type");
    return tool;
  }

  private static ObjectNode capabilityTool(ObjectMapper mapper, Map<String, Object> api, String id) {
    ObjectNode tool = mapper.createObjectNode();
    tool.put("type", "function");
    ObjectNode fn = tool.putObject("function");
    fn.put("name", functionName(id));
    String hint = api.get("hint") == null ? "" : String.valueOf(api.get("hint")).trim();
    String args = api.get("args") == null ? "" : String.valueOf(api.get("args")).trim();
    String confirm =
        Boolean.TRUE.equals(api.get("confirm")) ? "调用后由服务端弹出确认卡，先不要向家人预确认。" : "";
    fn.put("description", (hint + (args.isEmpty() ? "" : " 参数：" + args) + confirm).trim());
    ObjectNode params = fn.putObject("parameters");
    params.put("type", "object");
    ObjectNode props = params.putObject("properties");
    ArrayNode required = mapper.createArrayNode();
    if (!args.isEmpty()) {
      for (String piece : splitArgs(args)) {
        addArg(props, required, piece);
      }
    }
    params.set("required", required);
    return tool;
  }

  /** 只在括号外切逗号，避免 items[{ name, quantity? }] 被拆成顶层字段。 */
  static List<String> splitArgs(String args) {
    List<String> out = new ArrayList<>();
    if (args == null || args.isBlank()) {
      return out;
    }
    StringBuilder buf = new StringBuilder();
    int depth = 0;
    for (int i = 0; i < args.length(); i++) {
      char c = args.charAt(i);
      if (c == '[' || c == '{') {
        depth++;
      } else if ((c == ']' || c == '}') && depth > 0) {
        depth--;
      }
      if (c == ',' && depth == 0) {
        if (!buf.isEmpty()) {
          out.add(buf.toString());
          buf.setLength(0);
        }
        continue;
      }
      buf.append(c);
    }
    if (!buf.isEmpty()) {
      out.add(buf.toString());
    }
    return out;
  }

  private static void addArg(ObjectNode props, ArrayNode required, String raw) {
    String token = raw == null ? "" : raw.trim();
    if (token.isEmpty()) {
      return;
    }
    boolean optional = token.endsWith("?");
    if (optional) {
      token = token.substring(0, token.length() - 1).trim();
    }
    int objectAt = token.indexOf("[{");
    int arrayAt = token.indexOf("[]");
    boolean objectArray = objectAt >= 0 && (arrayAt < 0 || objectAt < arrayAt);
    boolean stringArray = !objectArray && arrayAt >= 0;
    String name = token.replaceAll("[^A-Za-z0-9_].*$", "");
    if (name.isEmpty() || props.has(name)) {
      return;
    }
    ObjectNode schema = props.putObject(name);
    if (objectArray) {
      schema.put("type", "array");
      schema.putObject("items").put("type", "object");
    } else if (stringArray) {
      schema.put("type", "array");
      schema.putObject("items").put("type", "string");
    } else if ("quantity".equals(name) || "maxQuantity".equals(name) || "days".equals(name)) {
      schema.put("type", "number");
    } else if ("open".equals(name)) {
      schema.put("type", "boolean");
    } else {
      schema.put("type", "string");
    }
    if (!optional) {
      required.add(name);
    }
  }
}
