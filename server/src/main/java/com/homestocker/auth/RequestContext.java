package com.homestocker.auth;

import com.homestocker.common.ApiException;

public final class RequestContext {

  private static final ThreadLocal<AuthPrincipal> HOLDER = new ThreadLocal<>();

  private RequestContext() {}

  public static void set(AuthPrincipal principal) {
    HOLDER.set(principal);
  }

  public static AuthPrincipal get() {
    return HOLDER.get();
  }

  public static AuthPrincipal require() {
    AuthPrincipal principal = HOLDER.get();
    if (principal == null) {
      throw ApiException.unauthorized("未登录");
    }
    return principal;
  }

  public static void clear() {
    HOLDER.remove();
  }
}
