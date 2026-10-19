package com.homestocker.modules.ai.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.modules.ai.app.ModelCatalog;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class DeepSeekClient {

  private static final Logger log = LoggerFactory.getLogger(DeepSeekClient.class);
  private static final int DEFAULT_TIMEOUT_MS = 12_000;
  private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

  public record ToolCall(String id, String name, String arguments) {}

  public record ChatResult(String content, List<ToolCall> toolCalls, int status, long ms) {
    public ChatResult(String content, int status, long ms) {
      this(content, List.of(), status, ms);
    }
  }

  public record ModelError(String code, String message, boolean retryable) {}

  private final ObjectMapper objectMapper;

  public DeepSeekClient(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public ChatResult chatCompletions(
      String apiKey,
      String baseUrl,
      String model,
      String system,
      String userText,
      List<Map<String, String>> history,
      int timeoutMs,
      int maxTokens,
      boolean jsonObject)
      throws DeepSeekException {
    long started = System.currentTimeMillis();
    String url = ModelCatalog.completionsUrl(baseUrl);

    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", model != null && !model.isBlank() ? model : "deepseek-chat");
    body.put("stream", false);
    writeSampling(body, model);
    writeLimits(body, model, maxTokens);
    if (jsonObject) {
      body.set("response_format", objectMapper.createObjectNode().put("type", "json_object"));
    }

    ArrayNode messages = body.putArray("messages");
    messages.addObject().put("role", "system").put("content", system != null ? system : "");
    for (Map<String, String> row : history != null ? history : List.<Map<String, String>>of()) {
      String role = row.get("role");
      String text = row.get("text");
      String content = ShanghaiDates.stampContent(text, row.get("at"));
      if (content == null || content.isBlank()) {
        continue;
      }
      if ("system".equals(role)) {
        messages.addObject().put("role", "system").put("content", text);
        continue;
      }
      if (!"user".equals(role) && !"assistant".equals(role)) {
        continue;
      }
      messages.addObject().put("role", role).put("content", content);
    }
    messages.addObject().put("role", "user").put("content", userText != null ? userText : "");

    try {
      // 不用流式提交。HttpURLConnection 在流式 POST 时会先等一轮 100-continue，
      // 正文再停住又等一轮，20 秒读超时会变成约 40 秒。这里整包发出，只等一轮。
      Exchange exchange = postJson(url, apiKey, body.toString(), timeoutMs);
      long ms = System.currentTimeMillis() - started;
      if (exchange.status >= 400) {
        ModelError err = classifyError(exchange.status, exchange.body, "");
        log.info(
            "model fail status={} ms={} retryable={} body={}",
            exchange.status,
            ms,
            err.retryable(),
            abbreviate(exchange.body));
        throw new DeepSeekException(err.code(), err.message(), err.retryable(), exchange.status);
      }
      JsonNode rootNode = objectMapper.readTree(exchange.body == null ? "{}" : exchange.body);
      return toChatResult(rootNode, exchange.status, ms);
    } catch (DeepSeekException e) {
      throw e;
    } catch (Exception e) {
      long ms = System.currentTimeMillis() - started;
      ModelError err = classifyError(0, "", e.getMessage());
      boolean retryable = isRetryableNetwork(e);
      log.info(
          "model error ms={} retryable={} ex={}",
          ms,
          retryable,
          rootSummary(e));
      throw new DeepSeekException(
          err.code(), err.message(), retryable, 0, e);
    }
  }

  /**
   * 带原生 tools 的一轮补全。不强制 json_object，否则模型无法发出 tool_calls。
   */
  public ChatResult complete(
      String apiKey,
      String baseUrl,
      String model,
      ArrayNode messages,
      ArrayNode tools,
      int timeoutMs,
      int maxTokens)
      throws DeepSeekException {
    long started = System.currentTimeMillis();
    String url = ModelCatalog.completionsUrl(baseUrl);
    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", model != null && !model.isBlank() ? model : "deepseek-chat");
    body.put("stream", false);
    writeSampling(body, model);
    writeLimits(body, model, maxTokens);
    body.set("messages", messages == null ? objectMapper.createArrayNode() : messages);
    if (tools != null && !tools.isEmpty()) {
      body.set("tools", tools);
    }
    try {
      Exchange exchange = postJson(url, apiKey, body.toString(), timeoutMs);
      long ms = System.currentTimeMillis() - started;
      if (exchange.status >= 400) {
        ModelError err = classifyError(exchange.status, exchange.body, "");
        log.info(
            "model fail status={} ms={} retryable={} body={}",
            exchange.status,
            ms,
            err.retryable(),
            abbreviate(exchange.body));
        throw new DeepSeekException(err.code(), err.message(), err.retryable(), exchange.status);
      }
      JsonNode rootNode = objectMapper.readTree(exchange.body == null ? "{}" : exchange.body);
      return toChatResult(rootNode, exchange.status, ms);
    } catch (DeepSeekException e) {
      throw e;
    } catch (Exception e) {
      long ms = System.currentTimeMillis() - started;
      ModelError err = classifyError(0, "", e.getMessage());
      boolean retryable = isRetryableNetwork(e);
      log.info("model error ms={} retryable={} ex={}", ms, retryable, rootSummary(e));
      throw new DeepSeekException(err.code(), err.message(), retryable, 0, e);
    }
  }

  private ChatResult toChatResult(JsonNode rootNode, int status, long ms) {
    JsonNode message = rootNode.path("choices").path(0).path("message");
    String content = message.path("content").isNull() ? "" : message.path("content").asText("");
    List<ToolCall> calls = new ArrayList<>();
    JsonNode rawCalls = message.path("tool_calls");
    if (rawCalls.isArray()) {
      for (JsonNode call : rawCalls) {
        String id = call.path("id").asText("");
        JsonNode fn = call.path("function");
        String name = fn.path("name").asText("");
        String arguments = fn.path("arguments").isTextual()
            ? fn.path("arguments").asText("")
            : fn.path("arguments").toString();
        if (!name.isBlank()) {
          calls.add(new ToolCall(id.isBlank() ? "call_" + calls.size() : id, name, arguments));
        }
      }
    }
    log.info("model ok ms={} tools={}", ms, calls.size());
    return new ChatResult(content, calls, status, ms);
  }

  /** Kimi K2.6 的温度是固定的，传 0 会直接 400。不传则由对方使用非思考模式的 0.6。 */
  static void writeSampling(ObjectNode body, String model) {
    if (model != null && model.startsWith("kimi-")) {
      return;
    }
    body.put("temperature", 0);
  }

  /**
   * 思考默认开着的模型一律关掉：思考会吃掉输出额度，管家要的是正文里的 JSON。
   * 更关键的是 DeepSeek 官方要求——带 tools 的请求在思考模式下必须回传 reasoning_content，否则 400；
   * 助手正是带 tools 调的，关掉思考最省事。
   * 旧的 deepseek-chat 不认识 thinking 参数，不带。
   */
  static void writeLimits(ObjectNode body, String model, int maxTokens) {
    int tokens = maxTokens > 0 ? maxTokens : 800;
    if (model != null && model.startsWith("mimo-")) {
      body.put("max_completion_tokens", tokens);
      body.putObject("thinking").put("type", "disabled");
      return;
    }
    body.put("max_tokens", tokens);
    if (model != null && model.startsWith("kimi-k2.")) {
      body.putObject("thinking").put("type", "disabled");
      return;
    }
    if (model != null && model.startsWith("kimi-k3")) {
      // K3 用顶层 reasoning_effort 控强度（low/high/max，默认 max）；双保险压到最低档
      body.putObject("thinking").put("type", "disabled");
      body.put("reasoning_effort", "low");
      return;
    }
    if (model != null && (model.startsWith("deepseek-flash") || model.startsWith("deepseek-v4-"))) {
      body.putObject("thinking").put("type", "disabled");
    }
  }

  private record Exchange(int status, String body) {}

  private static Exchange postJson(String url, String apiKey, String json, int timeoutMs)
      throws java.io.IOException {
    int readMs = timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
    HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
    conn.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
    conn.setReadTimeout(readMs);
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    conn.setRequestProperty("Authorization", "Bearer " + apiKey);
    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
    conn.setRequestProperty("Accept", "application/json");
    byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
    conn.setRequestProperty("Content-Length", Integer.toString(bytes.length));
    try (OutputStream out = conn.getOutputStream()) {
      out.write(bytes);
    }
    int status = conn.getResponseCode();
    InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
    String text = "";
    if (in != null) {
      try (InputStream body = in) {
        text = new String(body.readAllBytes(), StandardCharsets.UTF_8);
      }
    }
    return new Exchange(status, text);
  }

  public static ModelError classifyError(int status, String body, String message) {
    String blob = (message != null ? message : "") + " " + (body != null ? body : "");
    if (status == 402
        || blob.matches("(?is).*(insufficient\\s*balance|余额不足|quota\\s*exceeded|额度不足|余额不够).*")) {
      return new ModelError(
          ErrorCodes.AI_QUOTA, "家庭 AI 额度可能已用完，请检查密钥余额或更换密钥", false);
    }
    return new ModelError(ErrorCodes.ACT_FAILED, "助手暂时不可用，请稍后重试", isRetryableStatus(status));
  }

  private static boolean isRetryableStatus(int status) {
    if (status == 0) {
      return true;
    }
    if (status == 401 || status == 402 || status == 429) {
      return true;
    }
    return status >= 500;
  }

  static boolean isRetryableNetwork(Throwable e) {
    Throwable cur = e;
    while (cur != null) {
      if (cur instanceof java.net.SocketTimeoutException
          || cur instanceof java.io.InterruptedIOException
          || cur instanceof java.net.ConnectException
          || cur instanceof java.net.UnknownHostException
          || cur instanceof java.net.NoRouteToHostException) {
        return true;
      }
      String msg = cur.getMessage();
      if (msg != null && msg.matches("(?i).*(timeout|timed out).*")) {
        return true;
      }
      cur = cur.getCause();
    }
    return false;
  }

  private static String abbreviate(String raw) {
    if (raw == null || raw.isBlank()) {
      return "";
    }
    String oneLine = raw.replaceAll("\\s+", " ").trim();
    return oneLine.length() > 180 ? oneLine.substring(0, 180) : oneLine;
  }

  private static String rootSummary(Throwable e) {
    Throwable root = e;
    while (root.getCause() != null && root.getCause() != root) {
      root = root.getCause();
    }
    String msg = root.getMessage();
    if (msg == null || msg.isBlank()) {
      return root.getClass().getSimpleName();
    }
    return root.getClass().getSimpleName() + ": " + abbreviate(msg);
  }

  public static final class DeepSeekException extends Exception {
    private final String code;
    private final boolean retryable;
    private final int httpStatus;

    public DeepSeekException(String code, String message, boolean retryable, int httpStatus) {
      super(message);
      this.code = code;
      this.retryable = retryable;
      this.httpStatus = httpStatus;
    }

    public DeepSeekException(
        String code, String message, boolean retryable, int httpStatus, Throwable cause) {
      super(message, cause);
      this.code = code;
      this.retryable = retryable;
      this.httpStatus = httpStatus;
    }

    public String code() {
      return code;
    }

    public boolean retryable() {
      return retryable;
    }

    public int httpStatus() {
      return httpStatus;
    }
  }
}
