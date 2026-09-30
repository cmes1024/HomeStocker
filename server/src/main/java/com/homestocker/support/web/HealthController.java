package com.homestocker.support.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Smoke endpoint for local boot checks. No business logic. */
@RestController
public class HealthController {

  @GetMapping("/api/health")
  public Map<String, Object> health() {
    return Map.of(
        "ok", true,
        "service", "homestocker-server",
        "phase", "scaffold");
  }
}
