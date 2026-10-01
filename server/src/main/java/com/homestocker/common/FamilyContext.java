package com.homestocker.common;

/**
 * Resolved family scope for the current request. openid always comes from session, never from body.
 */
public record FamilyContext(String openid, String familyId) {

  public FamilyContext {
    if (openid == null || openid.isBlank()) {
      throw new IllegalArgumentException("openid required");
    }
    if (familyId == null || familyId.isBlank()) {
      throw new IllegalArgumentException("familyId required");
    }
  }
}
