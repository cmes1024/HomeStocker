package com.homestocker.modules.bootstrap.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.bootstrap.app.BootstrapService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/bootstrap")
public class BootstrapController {

  private final BootstrapService bootstrapService;

  public BootstrapController(BootstrapService bootstrapService) {
    this.bootstrapService = bootstrapService;
  }

  @PostMapping("/home")
  public ApiResponse<?> home(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(bootstrapService.home(body == null ? Map.of() : body));
  }
}
