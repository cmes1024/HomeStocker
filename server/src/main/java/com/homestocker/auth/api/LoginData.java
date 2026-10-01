package com.homestocker.auth.api;

public record LoginData(String token, UserView user) {}
