package com.homestocker.modules.ai.api;

import com.homestocker.common.ApiException;
import com.homestocker.common.ApiResponse;
import com.homestocker.common.ErrorCodes;
import com.homestocker.modules.ai.app.AiActService;
import com.homestocker.modules.ai.app.AiKeyService;
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

  public AiController(AiKeyService aiKeyService, AiActService aiActService) {
    this.aiKeyService = aiKeyService;
    this.aiActService = aiActService;
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

  @PostMapping("/act")
  public ApiResponse<?> act(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(aiActService.act(body(body)));
  }
}
