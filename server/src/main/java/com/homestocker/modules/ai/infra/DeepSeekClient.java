package com.homestocker.modules.ai.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.homestocker.common.ErrorCodes;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class DeepSeekClient {

  private static final Logger log = LoggerFactory.getLogger(DeepSeekClient.class);

  public record ChatResult(String content, int status, long ms) {}

  public record ModelError(String code, String message, boolean retryable) {}

  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  public DeepSeekClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
    this.restClient = restClientBuilder.build();
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
      int maxTokens)
      throws DeepSeekException {
    long started = System.currentTimeMillis();
    String root = normalizeBaseUrl(baseUrl);
    String url = root + "/chat/completions";

    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", model != null && !model.isBlank() ? model : "deepseek-chat");
    body.put("stream", false);
    body.put("temperature", 0);
    body.put("max_tokens", maxTokens > 0 ? maxTokens : 800);
    body.set("response_format", objectMapper.createObjectNode().put("type", "json_object"));

    ArrayNode messages = body.putArray("messages");
    messages.addObject().put("role", "system").put("content", system != null ? system : "");
    for (Map<String, String> row : history != null ? history : List.<Map<String, String>>of()) {
      String role = row.get("role");
      String content = row.get("text");
      if (content == null || content.isBlank()) {
        continue;
      }
      if (!"user".equals(role) && !"assistant".equals(role)) {
        continue;
      }
      messages.addObject().put("role", role).put("content", content);
    }
    messages.addObject().put("role", "user").put("content", userText != null ? userText : "");

    try {
      String responseBody =
          restClient
              .post()
              .uri(URI.create(url))
              .header("Authorization", "Bearer " + apiKey)
              .header("Content-Type", "application/json")
              .body(body.toString())
              .retrieve()
              .body(String.class);

      long ms = System.currentTimeMillis() - started;
      JsonNode rootNode = objectMapper.readTree(responseBody == null ? "{}" : responseBody);
      String content =
          rootNode.path("choices").path(0).path("message").path("content").asText("");
      log.info("deepseek ok ms={}", ms);
      return new ChatResult(content, 200, ms);
    } catch (RestClientResponseException e) {
      long ms = System.currentTimeMillis() - started;
      int status = e.getStatusCode().value();
      ModelError err = classifyError(status, e.getResponseBodyAsString(), e.getMessage());
      log.info("deepseek fail status={} ms={} retryable={}", status, ms, err.retryable());
      throw new DeepSeekException(err.code(), err.message(), err.retryable(), status);
    } catch (Exception e) {
      long ms = System.currentTimeMillis() - started;
      ModelError err = classifyError(0, "", e.getMessage());
      boolean retryable = isRetryableNetwork(e);
      log.info("deepseek error ms={} retryable={}", ms, retryable);
      throw new DeepSeekException(
          err.code(), err.message(), retryable, 0, e);
    }
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

  private static boolean isRetryableNetwork(Exception e) {
    if (e == null) {
      return false;
    }
    String msg = String.valueOf(e.getMessage());
    if (msg.matches("(?i).*timeout.*")) {
      return true;
    }
    return e instanceof java.net.SocketTimeoutException
        || e instanceof java.io.InterruptedIOException;
  }

  private static String normalizeBaseUrl(String baseUrl) {
    String b = baseUrl == null || baseUrl.isBlank() ? "https://api.deepseek.com" : baseUrl.trim();
    if (b.endsWith("/")) {
      b = b.substring(0, b.length() - 1);
    }
    if (!b.endsWith("/v1")) {
      b = b + "/v1";
    }
    return b;
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
  }
}
