package com.homestocker.modules.admin.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.admin.app.DashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 后台数据看板接口。
 *
 * <p>路径故意不用 {@code /api/**}：既避开小程序会话过滤器（{@code X-HS-Token}），
 * 也不会进入 AI 管家的能力表（能力表是静态清单 {@code capability-seed-v46.json}，不扫描 Controller）。
 */
@RestController
@RequestMapping("/admin/api")
public class AdminDashboardController {

  private final DashboardService service;

  public AdminDashboardController(DashboardService service) {
    this.service = service;
  }

  @GetMapping("/overview")
  public ApiResponse<?> overview() {
    return ApiResponse.success(service.overview());
  }
}
