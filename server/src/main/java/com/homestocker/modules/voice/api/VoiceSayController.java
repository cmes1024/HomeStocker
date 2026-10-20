package com.homestocker.modules.voice.api;

import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.FamilyAccess;
import com.homestocker.modules.voice.app.SpeechPhraseService;
import com.homestocker.modules.voice.app.VoiceSettingsService;
import com.homestocker.modules.voice.app.VoiceTtsClient;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管家页的朗读接口：一次往返完成「改写 → 校验 → 整段合成」。
 *
 * <p>看完答案之后才出声，等一整段合成完全可以接受，所以不做流式，返回一个 WAV 更省事。
 *
 * <p>为什么不让前端直接拿正文来合成：界面文案是给人看的，带格式、带书面语，念出来就是机器。
 * 改写结果由 {@link SpeechPhraseService} 校验，数量或空间对不上就退回原文。
 */
@RestController
@RequestMapping("/api/voice")
public class VoiceSayController {

  private final FamilyAccess familyAccess;
  private final VoiceSettingsService voiceSettingsService;
  private final SpeechPhraseService speechPhraseService;
  private final VoiceTtsClient voiceTtsClient;

  public VoiceSayController(
      FamilyAccess familyAccess,
      VoiceSettingsService voiceSettingsService,
      SpeechPhraseService speechPhraseService,
      VoiceTtsClient voiceTtsClient) {
    this.familyAccess = familyAccess;
    this.voiceSettingsService = voiceSettingsService;
    this.speechPhraseService = speechPhraseService;
    this.voiceTtsClient = voiceTtsClient;
  }

  @PostMapping("/say")
  public ResponseEntity<byte[]> say(@RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> in = body == null ? Map.of() : body;
    // 身份要走请求线程的 ThreadLocal，不能挪到异步线程
    familyAccess.requireCurrentFamily();

    String kind = str(in.get("kind")).trim();
    if (kind.isEmpty()) {
      kind = "answer";
    }
    String text = str(in.get("text")).trim();
    List<Map<String, Object>> facts = facts(in.get("facts"));
    if (text.isEmpty() && facts.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "text 与 facts 不能同时为空");
    }
    if (text.length() > 800) {
      text = text.substring(0, 800);
    }

    String voice = str(in.get("voice")).trim();
    VoiceSettingsService.Resolution cfg =
        voiceSettingsService.resolveCurrent(voice.isEmpty() ? "mimo_default" : voice);

    String say = speechPhraseService.say(cfg.key(), kind, text, facts);
    if (say.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "没有可朗读的内容");
    }

    byte[] wav;
    try {
      wav =
          VoiceTtsClient.wav(
              voiceTtsClient.pcm(cfg.key(), cfg.model(), say, cfg.voice()),
              VoiceTtsClient.SAMPLE_RATE);
    } catch (Exception e) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "语音合成失败：" + e.getMessage());
    }

    // 实际念出来的句子回传一份，便于排查「听到的」和「看到的」为什么不一样
    String echoed = Base64.getEncoder().encodeToString(say.getBytes(StandardCharsets.UTF_8));
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("audio/wav"))
        .header("X-HS-Say", echoed)
        .header("Cache-Control", "no-store")
        .body(wav);
  }

  private static List<Map<String, Object>> facts(Object raw) {
    List<Map<String, Object>> rows = new ArrayList<>();
    if (!(raw instanceof List<?> list)) {
      return rows;
    }
    for (Object item : list) {
      if (rows.size() >= 20) {
        break;
      }
      if (!(item instanceof Map<?, ?> map)) {
        continue;
      }
      Map<String, Object> row = new LinkedHashMap<>();
      for (Map.Entry<?, ?> e : map.entrySet()) {
        row.put(String.valueOf(e.getKey()), e.getValue());
      }
      rows.add(row);
    }
    return rows;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
