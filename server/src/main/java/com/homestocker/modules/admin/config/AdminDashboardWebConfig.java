package com.homestocker.modules.admin.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 让 {@code /admin} 与 {@code /admin/} 都落到静态看板页。 */
@Configuration
public class AdminDashboardWebConfig implements WebMvcConfigurer {

  @Override
  public void addViewControllers(ViewControllerRegistry registry) {
    registry.addViewController("/admin").setViewName("forward:/admin/index.html");
    registry.addViewController("/admin/").setViewName("forward:/admin/index.html");
  }
}
