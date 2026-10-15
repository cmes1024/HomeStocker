package com.homestocker.modules.ai.infra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.SocketTimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

class DeepSeekClientTest {

  @Test
  void stalledBodyReadIsRetryable() {
    SocketTimeoutException root = new SocketTimeoutException("Read timed out");
    ResourceAccessException wrapped = new ResourceAccessException("I/O error on POST request", root);
    assertTrue(DeepSeekClient.isRetryableNetwork(wrapped));
  }

  @Test
  void connectFailureIsRetryable() {
    assertTrue(DeepSeekClient.isRetryableNetwork(new java.net.ConnectException("Connection refused")));
  }

  @Test
  void mimoDisablesThinkingAndUsesCompletionTokenLimit() {
    ObjectNode body = JsonNodeFactory.instance.objectNode();
    DeepSeekClient.writeLimits(body, "mimo-v2.6-flash", 800);
    assertEquals(800, body.get("max_completion_tokens").asInt());
    assertFalse(body.has("max_tokens"));
    assertEquals("disabled", body.path("thinking").path("type").asText());
  }

  @Test
  void kimiOmitsTemperature() {
    ObjectNode kimi = JsonNodeFactory.instance.objectNode();
    DeepSeekClient.writeSampling(kimi, "kimi-k2.6");
    assertFalse(kimi.has("temperature"));

    ObjectNode deepseek = JsonNodeFactory.instance.objectNode();
    DeepSeekClient.writeSampling(deepseek, "deepseek-chat");
    assertEquals(0, deepseek.get("temperature").asInt());

    ObjectNode kimiLimits = JsonNodeFactory.instance.objectNode();
    DeepSeekClient.writeLimits(kimiLimits, "kimi-k2.6", 800);
    assertEquals(800, kimiLimits.get("max_tokens").asInt());
    assertEquals("disabled", kimiLimits.path("thinking").path("type").asText());
  }

  @Test
  void quotaStaysOnTheSameKeyWhileServerErrorsCanSwitch() {
    assertFalse(DeepSeekClient.classifyError(402, "insufficient balance", "").retryable());
    assertFalse(DeepSeekClient.classifyError(400, "bad request", "").retryable());
    assertTrue(DeepSeekClient.classifyError(503, "", "").retryable());
    assertTrue(DeepSeekClient.classifyError(429, "", "").retryable());
    assertTrue(DeepSeekClient.classifyError(401, "", "").retryable());
  }

  @Test
  void unrelatedFailureIsNotRetryable() {
    assertFalse(DeepSeekClient.isRetryableNetwork(new IllegalStateException("bad plan")));
  }
}
