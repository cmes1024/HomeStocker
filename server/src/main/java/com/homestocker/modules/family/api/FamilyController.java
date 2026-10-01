package com.homestocker.modules.family.api;

import com.homestocker.common.ApiResponse;
import com.homestocker.modules.family.app.FamilyService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Family module — paths align with cloud {@code family}/{action}.
 * Body fields match the cloud event shape for easy dual-run switching.
 */
@RestController
@RequestMapping("/api/family")
public class FamilyController {

  private final FamilyService familyService;

  public FamilyController(FamilyService familyService) {
    this.familyService = familyService;
  }

  @PostMapping("/create")
  public ApiResponse<?> create(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.create(body == null ? Map.of() : body));
  }

  @PostMapping("/join")
  public ApiResponse<?> join(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.join(body == null ? Map.of() : body));
  }

  @PostMapping("/getMyFamily")
  public ApiResponse<?> getMyFamily() {
    return ApiResponse.success(familyService.getMyFamily());
  }

  @PostMapping("/listMyFamilies")
  public ApiResponse<?> listMyFamilies() {
    return ApiResponse.success(familyService.listMyFamilies());
  }

  @PostMapping("/listMembers")
  public ApiResponse<?> listMembers() {
    return ApiResponse.success(familyService.listMembers());
  }

  @PostMapping("/page")
  public ApiResponse<?> page() {
    return ApiResponse.success(familyService.page());
  }

  @PostMapping("/updateProfile")
  public ApiResponse<?> updateProfile(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.updateProfile(body == null ? Map.of() : body));
  }

  @PostMapping("/switchFamily")
  public ApiResponse<?> switchFamily(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.switchFamily(body == null ? Map.of() : body));
  }

  @PostMapping("/updateBackground")
  public ApiResponse<?> updateBackground(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.updateBackground(body == null ? Map.of() : body));
  }

  @PostMapping("/updateName")
  public ApiResponse<?> updateName(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.updateName(body == null ? Map.of() : body));
  }

  @PostMapping("/updateExpireReminder")
  public ApiResponse<?> updateExpireReminder(
      @RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.updateExpireReminder(body == null ? Map.of() : body));
  }

  @PostMapping("/recordSubscribeExpire")
  public ApiResponse<?> recordSubscribeExpire() {
    return ApiResponse.success(familyService.recordSubscribeExpire());
  }

  @PostMapping("/getEntitlement")
  public ApiResponse<?> getEntitlement() {
    return ApiResponse.success(familyService.getEntitlement());
  }

  @PostMapping("/redeem")
  public ApiResponse<?> redeem(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.redeem(body == null ? Map.of() : body));
  }

  @PostMapping("/issueCodes")
  public ApiResponse<?> issueCodes(@RequestBody(required = false) Map<String, Object> body) {
    return ApiResponse.success(familyService.issueCodes(body == null ? Map.of() : body));
  }

  @PostMapping("/leave")
  public ApiResponse<?> leave() {
    return ApiResponse.success(familyService.leave());
  }
}
