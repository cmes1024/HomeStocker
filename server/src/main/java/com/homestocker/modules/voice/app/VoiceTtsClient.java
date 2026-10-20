package com.homestocker.modules.voice.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.homestocker.modules.ai.app.AiKeyService;
import com.homestocker.modules.ai.app.ModelCatalog;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.stereotype.Component;

/**
 * MiMo TTS 的最小封装：{@link #open} 暴露原始 SSE 流，{@link #pcm} 收完整段。
 *
 * <p>两者共用同一套请求体（user 为空串走默认语气，assistant 放待合成文本），区别只在消费方式。
 * 模型由调用方传入，取值见 {@link VoiceTtsModels}。
 */
@Component
public class VoiceTtsClient {

  /** MiMo pcm16 的实际采样率，已由朗读测试确认。 */
  public static final int SAMPLE_RATE = 24_000;

  private final ObjectMapper objectMapper;

  public VoiceTtsClient(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  /** 发起一次流式合成请求；调用方负责读流、断开连接。 */
  public HttpURLConnection open(
      AiKeyService.KeyRow key, String model, String text, String voice) throws IOException {
    HttpURLConnection conn =
        (HttpURLConnection)
            URI.create(ModelCatalog.completionsUrl(key.baseUrl())).toURL().openConnection();
    conn.setConnectTimeout(5_000);
    conn.setReadTimeout(20_000);
    conn.setRequestMethod("POST");
    conn.setDoOutput(true);
    conn.setRequestProperty("Authorization", "Bearer " + key.apiKey());
    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
    conn.setRequestProperty("Accept", "text/event-stream");

    ObjectNode body = objectMapper.createObjectNode();
    body.put("model", model);
    ArrayNode messages = body.putArray("messages");
    messages.addObject().put("role", "user").put("content", "");
    messages.addObject().put("role", "assistant").put("content", text);
    body.putObject("audio").put("format", "pcm16").put("voice", voice);
    body.put("stream", true);

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
      throw new IOException("语音合成 HTTP " + status + " " + brief(err));
    }
    return conn;
  }

  /** 整段合成：收齐所有 base64 PCM 片段，返回裸 s16le 单声道。 */
  public byte[] pcm(AiKeyService.KeyRow key, String model, String text, String voice)
      throws IOException {
    HttpURLConnection conn = open(key, model, text, voice);
    ByteArrayOutputStream pcm = new ByteArrayOutputStream(64 * 1024);
    try (BufferedReader reader =
        new BufferedReader(
            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        if (!line.startsWith("data:")) {
          continue;
        }
        String payload = line.substring(5).trim();
        if (payload.isEmpty() || "[DONE]".equals(payload)) {
          continue;
        }
        String data =
            objectMapper
                .readTree(payload)
                .path("choices")
                .path(0)
                .path("delta")
                .path("audio")
                .path("data")
                .asText("");
        if (!data.isEmpty()) {
          pcm.write(Base64.getDecoder().decode(data));
        }
      }
    } finally {
      conn.disconnect();
    }
    return pcm.toByteArray();
  }

  /** 加 44 字节 WAV 头。前端用 WebAudio 解码，标准容器比裸 PCM 好调试。 */
  public static byte[] wav(byte[] pcm, int sampleRate) {
    int dataLen = pcm.length;
    ByteArrayOutputStream out = new ByteArrayOutputStream(dataLen + 44);
    writeAscii(out, "RIFF");
    writeInt(out, 36 + dataLen);
    writeAscii(out, "WAVE");
    writeAscii(out, "fmt ");
    writeInt(out, 16);
    writeShort(out, 1); // PCM
    writeShort(out, 1); // 单声道
    writeInt(out, sampleRate);
    writeInt(out, sampleRate * 2); // 字节率：单声道 16bit
    writeShort(out, 2); // 块对齐
    writeShort(out, 16); // 位深
    writeAscii(out, "data");
    writeInt(out, dataLen);
    out.writeBytes(pcm);
    return out.toByteArray();
  }

  private static void writeAscii(ByteArrayOutputStream out, String s) {
    out.writeBytes(s.getBytes(StandardCharsets.US_ASCII));
  }

  private static void writeInt(ByteArrayOutputStream out, int v) {
    out.write(v & 0xff);
    out.write((v >> 8) & 0xff);
    out.write((v >> 16) & 0xff);
    out.write((v >> 24) & 0xff);
  }

  private static void writeShort(ByteArrayOutputStream out, int v) {
    out.write(v & 0xff);
    out.write((v >> 8) & 0xff);
  }

  private static String brief(String raw) {
    String oneLine = raw == null ? "" : raw.replaceAll("\\s+", " ").trim();
    return oneLine.length() > 240 ? oneLine.substring(0, 240) : oneLine;
  }
}
