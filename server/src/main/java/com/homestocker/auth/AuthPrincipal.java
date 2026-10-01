package com.homestocker.auth;

/** Authenticated caller resolved from Redis session. */
public record AuthPrincipal(String openid, String token) {}
