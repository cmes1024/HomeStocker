package com.homestocker.modules.activity.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.activity.app.ActivityService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/activity")
public class ActivityController {

  private final ActivityService activityService;

  public ActivityController(ActivityService activityService) {
    this.activityService = activityService;
  }

  @PostMapping("/list")
  public ApiResponse<?> list(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(activityService.list(body == null ? Map.of() : body));
  }

  @PostMapping("/cursor")
  public ApiResponse<?> cursor() {
    return ApiResponse.success(activityService.cursor());
  }
}
