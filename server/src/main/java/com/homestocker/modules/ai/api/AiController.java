package com.homestocker.modules.ai.api;

import com.homestocker.common.ApiException;
import com.homestocker.common.ApiResponse;
import com.homestocker.common.ErrorCodes;
import com.homestocker.modules.ai.app.AiActService;
import com.homestocker.modules.ai.app.AiCaptureService;
import com.homestocker.modules.ai.app.AiKeyService;
import com.homestocker.modules.ai.app.PlatformKeyService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiController {

  private final AiKeyService aiKeyService;
  private final AiActService aiActService;
  private final AiCaptureService aiCaptureService;
  private final PlatformKeyService platformKeyService;

  public AiController(
      AiKeyService aiKeyService,
      AiActService aiActService,
      AiCaptureService aiCaptureService,
      PlatformKeyService platformKeyService) {
    this.aiKeyService = aiKeyService;
    this.aiActService = aiActService;
    this.aiCaptureService = aiCaptureService;
    this.platformKeyService = platformKeyService;
  }

  private static Map<String, Object> body(Map<String, Object> body) {
    return body == null ? Map.of() : body;
  }

  @PostMapping("/listKeys")
  public ApiResponse<?> listKeys() {
    return ApiResponse.success(aiKeyService.listKeys());
  }

  @PostMapping("/addKey")
  public ApiResponse<?> addKey(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(aiKeyService.addKey(body(body)));
  }

  @PostMapping("/removeKey")
  public ApiResponse<?> removeKey(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(aiKeyService.removeKey(body(body)));
  }

  @PostMapping("/setDefaultKey")
  public ApiResponse<?> setDefaultKey(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(aiKeyService.setDefaultKey(body(body)));
  }

  @PostMapping("/setHostedDefault")
  public ApiResponse<?> setHostedDefault() {
    return ApiResponse.success(aiKeyService.setHostedDefault());
  }

  @PostMapping("/listPlatformKeys")
  public ApiResponse<?> listPlatformKeys() {
    return ApiResponse.success(platformKeyService.listKeys());
  }

  @PostMapping("/addPlatformKey")
  public ApiResponse<?> addPlatformKey(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(platformKeyService.addKey(body(body)));
  }

  @PostMapping("/removePlatformKey")
  public ApiResponse<?> removePlatformKey(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(platformKeyService.removeKey(body(body)));
  }

  @PostMapping("/setPlatformKeyEnabled")
  public ApiResponse<?> setPlatformKeyEnabled(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(platformKeyService.setEnabled(body(body)));
  }

  @PostMapping("/movePlatformKey")
  public ApiResponse<?> movePlatformKey(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(platformKeyService.moveKey(body(body)));
  }

  @PostMapping("/act")
  public ApiResponse<?> act(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(aiActService.act(body(body)));
  }

  /** 编辑页按图预填：一次性视觉抽取，只读，不写台账。 */
  @PostMapping("/capture")
  public ApiResponse<?> capture(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(aiCaptureService.capture(body(body)));
  }
}
