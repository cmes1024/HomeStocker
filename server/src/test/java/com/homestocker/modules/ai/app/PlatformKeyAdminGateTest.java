package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import org.junit.jupiter.api.Test;

class PlatformKeyAdminGateTest {

  @Test
  void nonAdminIsDenied() {
    ApiException denied = assertThrows(ApiException.class, () -> PlatformKeyService.requireAdmin(false));
    assertEquals(ErrorCodes.FORBIDDEN, denied.getCode());
    PlatformKeyService.requireAdmin(true);
  }

  @Test
  void maskNeverReturnsTheFullSecret() {
    String masked = PlatformKeyService.mask("sk-live-secret-value");
    assertEquals("sk-****alue", masked);
    assertFalse(masked.contains("secret"));
  }
}
