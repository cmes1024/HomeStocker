package com.homestocker.modules.item.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.item.app.ItemService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/item")
public class ItemController {

  private final ItemService itemService;

  public ItemController(ItemService itemService) {
    this.itemService = itemService;
  }

  private static Map<String, Object> body(Map<String, Object> body) {
    return body == null ? Map.of() : body;
  }

  @PostMapping("/create")
  public ApiResponse<?> create(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.create(body(body)));
  }

  @PostMapping("/createMany")
  public ApiResponse<?> createMany(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.createMany(body(body)));
  }

  @PostMapping("/update")
  public ApiResponse<?> update(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.update(body(body)));
  }

  @PostMapping("/remove")
  public ApiResponse<?> remove(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.remove(body(body)));
  }

  @PostMapping("/removeMany")
  public ApiResponse<?> removeMany(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.removeMany(body(body)));
  }

  @PostMapping("/merge")
  public ApiResponse<?> merge(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.merge(body(body)));
  }

  @PostMapping("/get")
  public ApiResponse<?> get(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.get(body(body)));
  }

  @PostMapping("/detail")
  public ApiResponse<?> detail(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.detail(body(body)));
  }

  @PostMapping("/editForm")
  public ApiResponse<?> editForm(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.editForm(body(body)));
  }

  @PostMapping("/list")
  public ApiResponse<?> list(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.list(body(body)));
  }

  @PostMapping("/count")
  public ApiResponse<?> count() {
    return ApiResponse.success(itemService.count());
  }

  @PostMapping("/search")
  public ApiResponse<?> search(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.search(body(body)));
  }

  @PostMapping("/listExpiring")
  public ApiResponse<?> listExpiring(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.listExpiring(body(body)));
  }

  @PostMapping("/home")
  public ApiResponse<?> home(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(itemService.home(body(body)));
  }
}
