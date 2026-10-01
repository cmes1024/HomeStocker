package com.homestocker.common;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(boolean ok, T data, ApiError error) {

  public static <T> ApiResponse<T> success(T data) {
    return new ApiResponse<>(true, data, null);
  }

  public static <T> ApiResponse<T> failure(String code, String message) {
    return new ApiResponse<>(false, null, new ApiError(code, message));
  }

  public static <T> ApiResponse<T> failure(ApiError error) {
    return new ApiResponse<>(false, null, error);
  }
}
