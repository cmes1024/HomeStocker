package com.homestocker.auth.api;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank(message = "不能为空") String code) {}
