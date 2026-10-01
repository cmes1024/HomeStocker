package com.homestocker.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ApiException;
import com.homestocker.common.ApiResponse;
import com.homestocker.config.HomestockerProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AuthFilter extends OncePerRequestFilter {

  private static final Set<String> PUBLIC_PATHS = Set.of("/api/health", "/api/auth/login");

  private final SessionService sessionService;
  private final ObjectMapper objectMapper;
  private final String headerName;

  public AuthFilter(
      SessionService sessionService,
      ObjectMapper objectMapper,
      HomestockerProperties properties) {
    this.sessionService = sessionService;
    this.objectMapper = objectMapper;
    this.headerName = properties.getSession().getHeader();
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    if (path == null) {
      return true;
    }
    if (!path.startsWith("/api/")) {
      return true;
    }
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      return true;
    }
    return PUBLIC_PATHS.contains(path);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    try {
      String token = request.getHeader(headerName);
      if (token == null || token.isBlank()) {
        throw ApiException.unauthorized("未登录");
      }
      SessionRecord session = sessionService.require(token.trim());
      RequestContext.set(new AuthPrincipal(session.openid(), token.trim()));
      filterChain.doFilter(request, response);
    } catch (ApiException ex) {
      writeError(response, ex);
    } finally {
      RequestContext.clear();
    }
  }

  private void writeError(HttpServletResponse response, ApiException ex) throws IOException {
    response.setStatus(ex.getStatus().value());
    response.setCharacterEncoding("UTF-8");
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(response.getOutputStream(), ApiResponse.failure(ex.toError()));
  }
}
