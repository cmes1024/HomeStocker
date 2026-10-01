package com.homestocker.modules.storage.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.storage.app.StorageService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

  /**
   * 二进制直传（Content-Type: image/*）。query: kind、ext。
   * 小程序默认走此接口，避免 request 合法域名再配 MinIO。
   */
  @PostMapping("/upload")
  public ApiResponse<?> upload(
      @RequestParam(required = false, defaultValue = "item") String kind,
      @RequestParam(required = false) String ext,
      HttpServletRequest request)
      throws IOException {
    String contentType = request.getHeader(HttpHeaders.CONTENT_TYPE);
    long size = request.getContentLengthLong();
    if (size > 0) {
      return ApiResponse.success(
          storageService.upload(kind, contentType, ext, request.getInputStream(), size));
    }
    // 无 Content-Length 时读入内存（仍受 StorageService 上限约束）
    byte[] bytes = request.getInputStream().readAllBytes();
    return ApiResponse.success(
        storageService.upload(
            kind, contentType, ext, new java.io.ByteArrayInputStream(bytes), bytes.length));
  }

  @PostMapping("/remove")
  public ApiResponse<?> remove(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(storageService.remove(body == null ? Map.of() : body));
  }
}
