package com.homestocker.modules.ai.agent;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 最后一道闸：模型偶尔把接口名/工具名写进给家人的话（「先调 item_search 查全库」）。
 *
 * <p>提示词已经要求不说接口名，但不能把产品口径押在模型自觉上，所以出口再确定性替换一遍。
 * 只改措辞，不改任何决策、路由或数据。
 */
public final class ReplyRedactor {

  /** 长词优先，避免 item.search 被 item 抢先截断。 */
  private static final Map<String, String> WORDS = words();

  private static final Pattern TOOL_ID =
      Pattern.compile("(?<![A-Za-z0-9_.])([a-z]+[._][a-zA-Z]+)(?![A-Za-z0-9_])");

  /** 不带点/下划线的工具名（模型会写「用 present 画表」），按整词替换，别误伤 task 之类。 */
  private static final Map<String, String> BARE = bareWords();

  private static final Pattern BARE_WORD =
      Pattern.compile("(?<![A-Za-z0-9_])(present|probe|ask)(?![A-Za-z0-9_])");

  /** 模型偶尔吐 Anthropic 风格的伪工具调用 XML（<function=…><parameter=…>），不能当正文。 */
  private static final Pattern PSEUDO_CALL =
      Pattern.compile("<(?:tool|function|parameter|invoke)[\\s=>/]", Pattern.CASE_INSENSITIVE);

  /**
   * 去掉伪工具调用块，只保留它前面的中文（模型常先说一句再吐 XML）。
   * 返回空串表示这轮没有任何可给人看的正文。
   */
  public static String stripPseudoCalls(String text) {
    String t = text == null ? "" : text;
    Matcher m = PSEUDO_CALL.matcher(t);
    if (!m.find()) {
      return t;
    }
    int lineStart = t.lastIndexOf('\n', m.start());
    String head = lineStart > 0 ? t.substring(0, lineStart) : "";
    // 顺手去掉紧贴在伪调用前面的标签行（如 <tool_call>），别留半截壳
    String[] lines = head.split("\n", -1);
    int end = lines.length;
    while (end > 0 && lines[end - 1].trim().matches("</?[A-Za-z_][^>]*>")) {
      end--;
    }
    if (end == 0) {
      return "";
    }
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < end; i++) {
      if (i > 0) {
        sb.append('\n');
      }
      sb.append(lines[i]);
    }
    return sb.toString().trim();
  }

  private ReplyRedactor() {}

  private static Map<String, String> words() {
    Map<String, String> m = new LinkedHashMap<>();
    put(m, "item.listExpiring", "看临期");
    put(m, "item.removeMany", "批量删除");
    put(m, "item.createMany", "批量记");
    put(m, "item.remove", "删一件");
    put(m, "item.create", "记一笔");
    put(m, "item.update", "改一改");
    put(m, "item.search", "查库");
    put(m, "item.stats", "统计");
    put(m, "item.merge", "合并");
    put(m, "space.createLocationMany", "批量建位置");
    put(m, "space.createLocation", "建位置");
    put(m, "space.createMany", "批量建空间");
    put(m, "space.create", "建空间");
    put(m, "space.remove", "删空间");
    put(m, "tag.create", "建标签");
    put(m, "tag.remove", "删标签");
    put(m, "activity.list", "看家庭消息");
    put(m, "knowledge.get", "查说明");
    put(m, "page.get", "打开管理页");
    put(m, "habit.list", "看偏好");
    put(m, "habit.upsert", "记偏好");
    put(m, "habit.remove", "删偏好");
    put(m, "habit.observe", "看偏好");
    return m;
  }

  /** 点号与下划线两种写法都要收：模型两种都会写。 */
  private static void put(Map<String, String> m, String id, String zh) {
    m.put(id, zh);
    m.put(id.replace('.', '_'), zh);
  }

  private static Map<String, String> bareWords() {
    Map<String, String> m = new LinkedHashMap<>();
    m.put("present", "表格");
    m.put("probe", "查库");
    m.put("ask", "确认");
    return m;
  }

  /** 给家人看的文本统一脱敏：接口名 → 家人能懂的动作。 */
  public static String redact(String text) {
    String t = text == null ? "" : text;
    if (t.isEmpty()) {
      return t;
    }
    String out = replaceAll(t, WORDS);
    // 兜底：表里没收录的 a.b / a_b 形式，统一说成「后台工具」，不把标识漏出去
    Matcher m = TOOL_ID.matcher(out);
    StringBuilder sb = new StringBuilder();
    while (m.find()) {
      m.appendReplacement(sb, Matcher.quoteReplacement("后台工具"));
    }
    m.appendTail(sb);
    out = replaceBare(sb.toString());
    // 中英混排时替换处会留下空格（「查库 返回物资行」），中文之间的空格去掉
    return out.replaceAll("(?<=[\\u4e00-\\u9fa5]) +(?=[\\u4e00-\\u9fa5])", "");
  }

  private static String replaceAll(String text, Map<String, String> dict) {
    String out = text;
    for (Map.Entry<String, String> e : dict.entrySet()) {
      out = out.replace(e.getKey(), e.getValue());
    }
    return out;
  }

  private static String replaceBare(String text) {
    Matcher m = BARE_WORD.matcher(text);
    StringBuilder sb = new StringBuilder();
    while (m.find()) {
      String zh = BARE.getOrDefault(m.group(1), "后台工具");
      m.appendReplacement(sb, Matcher.quoteReplacement(zh));
    }
    m.appendTail(sb);
    return sb.toString();
  }
}
