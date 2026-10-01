package com.homestocker.modules.tag.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.tag.app.TagService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tag")
public class TagController {

  private final TagService tagService;

  public TagController(TagService tagService) {
    this.tagService = tagService;
  }

  private static Map<String, Object> body(Map<String, Object> body) {
    return body == null ? Map.of() : body;
  }

  @PostMapping("/ensureDefaults")
  public ApiResponse<?> ensureDefaults() {
    return ApiResponse.success(tagService.ensureDefaults());
  }

  @PostMapping("/list")
  public ApiResponse<?> list() {
    return ApiResponse.success(tagService.list());
  }

  @PostMapping("/create")
  public ApiResponse<?> create(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(tagService.create(body(body)));
  }

  @PostMapping("/createMany")
  public ApiResponse<?> createMany(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(tagService.createMany(body(body)));
  }

  @PostMapping("/update")
  public ApiResponse<?> update(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(tagService.update(body(body)));
  }

  @PostMapping("/remove")
  public ApiResponse<?> remove(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(tagService.remove(body(body)));
  }

  @PostMapping("/removeMany")
  public ApiResponse<?> removeMany(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(tagService.removeMany(body(body)));
  }
}
