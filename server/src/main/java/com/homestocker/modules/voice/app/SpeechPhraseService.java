package com.homestocker.modules.voice.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.homestocker.modules.ai.app.AiKeyService;
import com.homestocker.modules.ai.app.ModelCatalog;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 把「要给用户看的事实」改写成「像人说的话」。
 *
 * <p>分工是硬的：事实由调用方给（物品、数量、单位、空间、成功与否），模型只决定怎么遣词。
 * 改写结果回来后会逐项校验——数量、物品名、空间名少一个，或者失败的事实被说成已经办成，
 * 一律退回原文。宁可听起来像模板，也不能说错。
 *
 * <p>调用失败、超时、返回空，同样走回退，不抛异常：朗读是锦上添花，不能让它把主流程拖挂。
 */
@Component
public class SpeechPhraseService {

  private static final Logger log = LoggerFactory.getLogger(SpeechPhraseService.class);

  /** 改写最多等这么久。超人这个数就说明模型不跟手，直接用原文，别让用户干等。 */
  private static final int REWRITE_TIMEOUT_MS = 4_000;

  /**
   * 一次合成的上限，念完约 40 秒。再长就是噪音——朗读是边做事边听的，不是听书。
   *
   * <p>超长不会硬切：退到最近的句读处，宁可少念半句，不留半截话。
   */
  private static final int MAX_CHARS = 150;

  /**
   * 改写用的对话模型。与朗读模型分开：这段要的是「把事实说顺」，不是「出声」，
   * 所以走 MiMo 的对话模型；合成另用 {@link VoiceTtsModels} 里的 TTS 模型。
   */
  private static final String REWRITE_MODEL = "mimo-v2.6-pro";


  /** 服务腔、客服腔，出现就判失败。 */
  private static final List<String> BANNED =
      List.of("为您", "请问", "作为", "助手", "很高兴", "希望", "以下", "上述", "首先", "其次", "如需");

  /** 办成话术：只有在事实确实成功时才允许出现。 */
  private static final List<String> DONE_WORDS =
      List.of("已经", "已", "好了", "记下", "加上", "放好", "完成", "搞定", "办好");

  private static final String PERSONA =
      "你是这家人的管家，正对着手机说话。"
          + "像熟人随口一提：短句，直接给结果，不客套，不用「为您」「请问」「已为您」。"
          + "一次只说一件事，不超过三十个字。只说事实，不要补充建议。";

  private final ObjectMapper objectMapper;

  public SpeechPhraseService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  /**
   * 生成一句可直接合成的口语。
   *
   * @param kind answer / confirm / receipt
   * @param text 界面上的原文，作为兜底与语义参考
   * @param facts 结构化事实，字段随 kind 不同：name/quantity/unit/spaceName/ok/list
   * @return 非空的可朗读文本；失败时返回原文的清理版
   */
  public String say(
      AiKeyService.KeyRow key,
      String kind,
      String text,
      List<Map<String, Object>> facts) {
    // 数字的读法在最后统一处理：改写在上面，口径要覆盖所有出口
    return SpokenNumbers.speak(phrase(key, kind, text, facts));
  }

  private String phrase(
      AiKeyService.KeyRow key,
      String kind,
      String text,
      List<Map<String, Object>> facts) {
    String k = kind == null ? "answer" : kind;

    // 答案本身就是要说的话。交给模型「压成两句」只会丢掉结尾，还要白等一次改写；
    // 清理格式后直接念，反而更完整、更快出声。
    if ("answer".equals(k)) {
      String base = tidy(text);
      if (!base.isEmpty()) {
        return clip(base);
      }
    }

    String fallback = fallback(k, text, facts);
    if (fallback.isEmpty()) {
      return "";
    }
    try {
      String raw = call(key, k, text, facts);
      String cleaned = tidy(raw);
      if (cleaned.isEmpty()) {
        return fallback;
      }
      String problem = validate(cleaned, facts);
      if (problem != null) {
        log.info("口语改写被拦下（{}），回退原文：{}", problem, cleaned);
        return fallback;
      }
      return clip(cleaned);
    } catch (Exception e) {
      log.info("口语改写失败，回退原文：{}", e.getMessage());
      return fallback;
    }
  }

  private String call(
      AiKeyService.KeyRow key, String kind, String text, List<Map<String, Object>> facts)
      throws IOException {
    HttpURLConnection conn =
        (HttpURLConnection)
            URI.create(ModelCatalog.completionsUrl(key.baseUrl())).toURL().openConnection();
    conn.setConnectTimeout(2_000);
    conn.setReadTimeout(REWRITE_TIMEOUT_MS);
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    conn.setRequestProperty("Authorization", "Bearer " + key.apiKey());
    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", REWRITE_MODEL);
    body.put("stream", false);
    body.put("temperature", 0.8);
    body.put("max_tokens", 120);

    ArrayNode messages = body.putArray("messages");
    messages.addObject().put("role", "system").put("content", PERSONA + "\n\n" + rules(kind));
    messages.addObject().put("role", "user").put("content", payload(kind, text, facts));

    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
    conn.setRequestProperty("Content-Length", Integer.toString(bytes.length));
    try (OutputStream os = conn.getOutputStream()) {
      os.write(bytes);
    }

    int status = conn.getResponseCode();
    if (status >= 400) {
      String err = "";
      try (InputStream es = conn.getErrorStream()) {
        if (es != null) {
          err = new String(es.readAllBytes(), StandardCharsets.UTF_8);
        }
      }
      conn.disconnect();
      throw new IOException("改写 HTTP " + status + " " + brief(err));
    }

    try (InputStream in = conn.getInputStream()) {
      JsonNode root = objectMapper.readTree(in);
      conn.disconnect();
      return root.path("choices").path(0).path("message").path("content").asText("");
    }
  }

  private static String rules(String kind) {
    return switch (kind == null ? "" : kind) {
      case "confirm" ->
          "下面是准备做但还没做的一件事。用一句话问对方认不认，保留物品、数量、空间，"
              + "不要说已经做完。像「两桶油放仓库，行吗？」这样。";
      case "receipt" ->
          "下面这件事刚办完。用一句话交代结果，保留物品和数量，语气平常，不要邀功。"
              + "失败的话就照实说没办成，别绕。";
      default ->
          "下面是一段回答。压成两句以内的大白话，只留结论，去掉罗列、书名号和书面语。";
    };
  }

  /** 事实单独一份 JSON，正文单独一句，避免模型把界面文案当成要照抄的台词。 */
  private String payload(String kind, String text, List<Map<String, Object>> facts) {
    Map<String, Object> in = new LinkedHashMap<>();
    in.put("kind", kind == null ? "answer" : kind);
    in.put("facts", facts == null ? List.of() : facts);
    in.put("draft", text == null ? "" : text);
    try {
      return objectMapper.writeValueAsString(in);
    } catch (Exception e) {
      return String.valueOf(in);
    }
  }

  /** 去掉引号、角色前缀、markdown；只留第一句，防止模型自作多情补一段。 */
  private static String tidy(String raw) {
    String s = raw == null ? "" : raw.trim();
    s = s.replaceAll("^[\"'“”‘’「」]", "").replaceAll("[\"'“”‘’「」]$", "");
    s = s.replaceAll("^(管家|我|回答)[：:]\\s*", "");
    s = s.replaceAll("[*#`>_~\\[\\]()（）]", "");
    s = s.replaceAll("\\s+", " ").trim();
    if (s.contains("\n")) {
      s = s.split("\n")[0].trim();
    }
    return s;
  }

  /** 返回拦截原因；null 表示通过。 */
  private static String validate(String say, List<Map<String, Object>> facts) {
    if (say.length() > MAX_CHARS) {
      return "太长";
    }
    for (String word : BANNED) {
      if (say.contains(word)) {
        return "服务腔：" + word;
      }
    }
    if (facts == null || facts.isEmpty()) {
      return null;
    }
    boolean allOk = true;
    List<String> numbers = new ArrayList<>();
    List<String> names = new ArrayList<>();
    List<String> spaces = new ArrayList<>();
    for (Map<String, Object> row : facts) {
      if (row == null) {
        continue;
      }
      if (Boolean.FALSE.equals(row.get("ok"))) {
        allOk = false;
      }
      String q = str(row.get("quantity"));
      if (!q.isEmpty()) {
        numbers.add(q);
      }
      String name = str(row.get("name"));
      if (!name.isEmpty()) {
        names.add(name);
      }
      Object refs = row.get("names");
      if (refs instanceof List<?> list) {
        for (Object n : list) {
          String one = str(n);
          if (!one.isEmpty()) {
            names.add(one);
          }
        }
      }
      String space = str(row.get("spaceName"));
      if (!space.isEmpty()) {
        spaces.add(space);
      }
    }
    for (String name : names) {
      if (!say.contains(name)) {
        return "漏了物品：" + name;
      }
    }
    for (String space : spaces) {
      if (!say.contains(space)) {
        return "漏了空间：" + space;
      }
    }
    for (String number : numbers) {
      // 「一把梯子」说成「折叠梯」是口语常态，1 不强求
      if (isOne(number)) {
        continue;
      }
      if (!mentionsNumber(say, number)) {
        return "漏了数量：" + number;
      }
    }
    if (!allOk && saysDone(say)) {
      return "把没办成的说成了办成";
    }
    return null;
  }

  private static boolean isOne(String quantity) {
    return "1".equals(quantity) || "1.0".equals(quantity);
  }

  /** 「没加上」里的「加上」不算谎报：否定词在前就放过 */
  private static boolean saysDone(String say) {
    for (String word : DONE_WORDS) {
      int at = say.indexOf(word);
      if (at < 0) {
        continue;
      }
      String before = say.substring(Math.max(0, at - 2), at);
      if (before.contains("没") || before.contains("未") || before.contains("不")) {
        continue;
      }
      return true;
    }
    return false;
  }

  /** 「2」在口语里常说「两」，两种都算命中。 */
  private static boolean mentionsNumber(String say, String quantity) {
    if (say.contains(quantity)) {
      return true;
    }
    String cn = chineseNumber(quantity);
    return !cn.isEmpty() && say.contains(cn);
  }

  private static String chineseNumber(String quantity) {
    return switch (quantity) {
      case "1", "1.0" -> "一";
      case "2", "2.0" -> "两";
      case "3", "3.0" -> "三";
      case "4", "4.0" -> "四";
      case "5", "5.0" -> "五";
      case "6", "6.0" -> "六";
      case "7", "7.0" -> "七";
      case "8", "8.0" -> "八";
      case "9", "9.0" -> "九";
      case "10", "10.0" -> "十";
      default -> "";
    };
  }

  /**
   * 兜底句。
   *
   * <p>confirm/receipt 不能退回界面文案——那可能是「确认添加」这类标题，念出来比模板还僵。
   * 所以有事实时按事实造句；只有 answer 才退回原文。两句都只用给定的事实，不添新信息。
   */
  private static String fallback(String kind, String text, List<Map<String, Object>> facts) {
    String k = kind == null ? "answer" : kind;
    boolean hasFacts = facts != null && !facts.isEmpty();
    String base = tidy(text);
    // answer 有原文就念原文；原文为空但带事实时，才按事实造句
    boolean byTemplate = hasFacts && (!"answer".equals(k) || base.isEmpty());
    if (byTemplate) {
      boolean allOk = true;
      List<String> parts = new ArrayList<>();
      for (Map<String, Object> row : facts) {
        if (row == null) {
          continue;
        }
        if (Boolean.FALSE.equals(row.get("ok"))) {
          allOk = false;
        }
        String name = str(row.get("name"));
        String q = str(row.get("quantity"));
        String unit = str(row.get("unit"));
        String space = str(row.get("spaceName"));
        String one = name + amount(q, unit);
        if (!space.isEmpty()) {
          one = one + "，" + space;
        }
        if (!one.isEmpty()) {
          parts.add(one);
        }
      }
      String body = String.join("，", parts);
      if ("confirm".equals(k)) {
        return clip(body + "，对吗？");
      }
      if ("receipt".equals(k)) {
        return clip(allOk ? "好，" + body + "。" : body + "没弄成。");
      }
    }
    return clip(base);
  }

  /**
   * 超长时退到最近的句读处。
   *
   * <p>以前是 {@code substring(0, MAX_CHARS)}，一句话被腰斩在词中间——「想查想记」后面
   * 的「随时叫我」就是这么没的。宁可少念一句，不留半截话。
   */
  private static String clip(String s) {
    if (s == null || s.length() <= MAX_CHARS) {
      return s == null ? "" : s;
    }
    int end = -1;
    for (int i = 0; i < MAX_CHARS; i++) {
      char c = s.charAt(i);
      if (c == '。' || c == '！' || c == '？' || c == '；' || c == '，') {
        end = i + 1;
      }
    }
    return end > 0 ? s.substring(0, end) : s.substring(0, MAX_CHARS);
  }

  /** 「2桶」念成「两桶」，「1把」念成「一把」 */
  private static String amount(String quantity, String unit) {
    if (quantity.isEmpty()) {
      return "";
    }
    String cn = chineseNumber(quantity);
    return (cn.isEmpty() ? quantity : cn) + unit;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }

  private static String brief(String raw) {
    String oneLine = raw == null ? "" : raw.replaceAll("\\s+", " ").trim();
    return oneLine.length() > 160 ? oneLine.substring(0, 160) : oneLine;
  }
}
