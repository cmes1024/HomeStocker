package com.homestocker.infra.jdbc;

public record UserRow(
    String openid, String currentFamilyId, String nickname, String avatarUrl) {}
