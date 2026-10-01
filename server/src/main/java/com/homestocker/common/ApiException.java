package com.homestocker.common;

import org.springframework.http.HttpStatus;

/** Business / auth failure mapped to the unified API envelope. */
public class ApiException extends RuntimeException {

  private final String code;
  private final HttpStatus status;

  public ApiException(String code, String message, HttpStatus status) {
    super(message);
    this.code = code;
    this.status = status;
  }

  public static ApiException of(String code, String message) {
    return new ApiException(code, message, HttpStatus.OK);
  }

  public static ApiException unauthorized(String message) {
    return new ApiException(ErrorCodes.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }

  public static ApiException badRequest(String message) {
    return new ApiException(ErrorCodes.BAD_REQUEST, message, HttpStatus.BAD_REQUEST);
  }

  public String getCode() {
    return code;
  }

  public HttpStatus getStatus() {
    return status;
  }

  public ApiError toError() {
    return new ApiError(code, getMessage());
  }
}
