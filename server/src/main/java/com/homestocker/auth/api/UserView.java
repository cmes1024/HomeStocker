package com.homestocker.auth.api;

import com.homestocker.infra.jdbc.UserRow;

public record UserView(
    String openid, String currentFamilyId, String nickname, String avatarUrl) {

  public static UserView from(UserRow row) {
    return new UserView(
        row.openid(),
        row.currentFamilyId(),
        row.nickname() == null ? "" : row.nickname(),
        row.avatarUrl() == null ? "" : row.avatarUrl());
  }
}
