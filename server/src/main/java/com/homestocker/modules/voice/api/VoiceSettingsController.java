package com.homestocker.modules.voice.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.voice.app.VoiceSettingsService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 朗读设置读写。与合成接口分开，返回普通 JSON。 */
@RestController
@RequestMapping("/api/voice")
public class VoiceSettingsController {

  private final VoiceSettingsService voiceSettingsService;

  public VoiceSettingsController(VoiceSettingsService voiceSettingsService) {
    this.voiceSettingsService = voiceSettingsService;
  }

  /** 管家页用来决定要不要显示朗读入口；不抛异常，没有可用密钥也返回 200。 */
  @PostMapping("/capability")
  public ApiResponse<?> capability() {
    return ApiResponse.success(voiceSettingsService.capability());
  }

  /** 读取当前家庭的朗读设置，同时返回生效值，前端不用自己算回退。 */
  @PostMapping("/settings/get")
  public ApiResponse<?> getSettings() {
    return ApiResponse.success(voiceSettingsService.read());
  }

  /** 保存设置；模型走白名单校验，密钥只接受本家庭 MiMo 密钥。 */
  @PostMapping("/settings/save")
  public ApiResponse<?> saveSettings(@RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> in = body == null ? Map.of() : body;
    voiceSettingsService.save(str(in.get("model")), str(in.get("voice")), str(in.get("keyId")));
    return ApiResponse.success(voiceSettingsService.read());
  }

  private static String str(Object value) {
    return value == null ? "" : String.valueOf(value);
  }
}
