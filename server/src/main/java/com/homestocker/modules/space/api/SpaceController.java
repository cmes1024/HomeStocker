package com.homestocker.modules.space.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.space.app.SpaceService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/space")
public class SpaceController {

  private final SpaceService spaceService;

  public SpaceController(SpaceService spaceService) {
    this.spaceService = spaceService;
  }

  private static Map<String, Object> body(Map<String, Object> body) {
    return body == null ? Map.of() : body;
  }

  @PostMapping("/ensureDefault")
  public ApiResponse<?> ensureDefault() {
    return ApiResponse.success(spaceService.ensureDefault());
  }

  @PostMapping("/list")
  public ApiResponse<?> list() {
    return ApiResponse.success(spaceService.list());
  }

  @PostMapping("/create")
  public ApiResponse<?> create(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.create(body(body)));
  }

  @PostMapping("/createMany")
  public ApiResponse<?> createMany(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.createMany(body(body)));
  }

  @PostMapping("/update")
  public ApiResponse<?> update(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.update(body(body)));
  }

  @PostMapping("/remove")
  public ApiResponse<?> remove(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.remove(body(body)));
  }

  @PostMapping("/removeMany")
  public ApiResponse<?> removeMany(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.removeMany(body(body)));
  }

  @PostMapping("/reorder")
  public ApiResponse<?> reorder(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.reorder(body(body)));
  }

  @PostMapping("/listLocations")
  public ApiResponse<?> listLocations(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.listLocations(body(body)));
  }

  @PostMapping("/createLocation")
  public ApiResponse<?> createLocation(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.createLocation(body(body)));
  }

  @PostMapping("/createLocationMany")
  public ApiResponse<?> createLocationMany(
      @RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.createLocationMany(body(body)));
  }

  @PostMapping("/updateLocation")
  public ApiResponse<?> updateLocation(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.updateLocation(body(body)));
  }

  @PostMapping("/removeLocation")
  public ApiResponse<?> removeLocation(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.removeLocation(body(body)));
  }

  @PostMapping("/removeLocationMany")
  public ApiResponse<?> removeLocationMany(
      @RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.removeLocationMany(body(body)));
  }

  @PostMapping("/listItemsBySpace")
  public ApiResponse<?> listItemsBySpace(
      @RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.listItemsBySpace(body(body)));
  }

  @PostMapping("/detail")
  public ApiResponse<?> detail(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.detail(body(body)));
  }

  @PostMapping("/listPockets")
  public ApiResponse<?> listPockets(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(spaceService.listPockets(body(body)));
  }
}
