package com.homestocker.modules.ai.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工具回执：只描述事实（哪个字段、给的值、申报来源、候选），不写下一步该怎么做。
 * 序列化后不超过 {@link #MAX_CHARS} 字符，保证单条回执不撑上下文。
 */
public record ToolFeedback(
    String code, String field, String given, String declared, String quote, List<String> candidates) {

  public static final int MAX_CHARS = 200;
  public static final int MAX_CANDIDATES = 5;

  private static final ObjectMapper JSON = new ObjectMapper();

  public static ToolFeedback of(String code) {
    return new ToolFeedback(code, "", "", "", "", List.of());
  }

  public static ToolFeedback of(String code, String field, Object given) {
    return new ToolFeedback(code, field, str(given), "", "", List.of());
  }

  public ToolFeedback declared(String origin) {
    return new ToolFeedback(code, field, given, str(origin), quote, candidates);
  }

  public ToolFeedback quoted(String words) {
    return new ToolFeedback(code, field, given, declared, str(words), candidates);
  }

  public ToolFeedback withCandidates(List<String> rows) {
    return new ToolFeedback(code, field, given, declared, quote, rows);
  }

  /** 紧凑 JSON；超长时按「不带指令句」的字段优先级依次丢弃，末尾仍有兜底。 */
  public String toJson() {
    String codeValue = str(code);
    String fieldValue = str(field);
    String givenValue = clip(str(given), 40);
    String declaredValue = str(declared);
    String quoteValue = clip(str(quote), 30);
    List<String> cands = new ArrayList<>();
    if (candidates != null) {
      for (String row : candidates) {
        String one = clip(str(row), 24);
        if (!one.isEmpty() && cands.size() < MAX_CANDIDATES) {
          cands.add(one);
        }
      }
    }
    while (true) {
      String json = render(codeValue, fieldValue, givenValue, declaredValue, quoteValue, cands);
      if (json.length() <= MAX_CHARS) {
        return json;
      }
      if (!quoteValue.isEmpty()) {
        quoteValue = "";
        continue;
      }
      if (!cands.isEmpty()) {
        cands.remove(cands.size() - 1);
        continue;
      }
      if (!declaredValue.isEmpty()) {
        declaredValue = "";
        continue;
      }
      if (givenValue.length() > 8) {
        givenValue = clip(givenValue, 8);
        continue;
      }
      String minimal = render(codeValue, "", "", "", "", List.of());
      return minimal.length() <= MAX_CHARS ? minimal : "{\"ok\":false,\"code\":\"" + codeValue + "\"}";
    }
  }

  private static String render(
      String code,
      String field,
      String given,
      String declared,
      String quote,
      List<String> candidates) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("ok", false);
    map.put("code", code);
    if (!field.isEmpty()) {
      map.put("field", field);
    }
    if (!given.isEmpty()) {
      map.put("given", given);
    }
    if (!declared.isEmpty()) {
      map.put("declared", declared);
    }
    if (!quote.isEmpty()) {
      map.put("quote", quote);
    }
    if (!candidates.isEmpty()) {
      map.put("candidates", candidates);
    }
    try {
      return JSON.writeValueAsString(map);
    } catch (Exception e) {
      return "{\"ok\":false,\"code\":\"ERR\"}";
    }
  }

  private static String clip(String value, int max) {
    if (value == null) {
      return "";
    }
    String text = value.trim();
    return text.length() <= max ? text : text.substring(0, max);
  }

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }
}
