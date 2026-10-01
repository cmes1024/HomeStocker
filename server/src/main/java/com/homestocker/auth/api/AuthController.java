package com.homestocker.auth.api;

import com.homestocker.auth.app.AuthService;
import com.homestocker.common.ApiResponse;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/login")
  public ApiResponse<LoginData> login(@Valid @RequestBody LoginRequest request) {
    return ApiResponse.success(authService.login(request.code()));
  }

  @PostMapping("/logout")
  public ApiResponse<Map<String, Object>> logout() {
    authService.logout();
    return ApiResponse.success(Map.of());
  }

  @PostMapping("/me")
  public ApiResponse<MeData> me() {
    return ApiResponse.success(authService.me());
  }
}
