package com.homestocker.modules.storage.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.storage.app.StorageService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/storage")
public class StorageController {

  private final StorageService storageService;

  public StorageController(StorageService storageService) {
    this.storageService = storageService;
  }

  @PostMapping("/presign")
  public ApiResponse<?> presign(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(storageService.presign(body == null ? Map.of() : body));
  }

  @PostMapping("/remove")
  public ApiResponse<?> remove(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(storageService.remove(body == null ? Map.of() : body));
  }
}
