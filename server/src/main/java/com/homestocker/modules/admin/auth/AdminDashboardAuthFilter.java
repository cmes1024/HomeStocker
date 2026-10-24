package com.homestocker.modules.admin.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 后台数据看板专用鉴权。
 *
 * <p>只作用于 {@code /admin/api/**}，与小程序的 {@code X-HS-Token} 会话链路完全隔离：
 * 不读 Redis、不碰 {@link com.homestocker.auth.RequestContext}、不影响 {@code /api/**} 的任何行为。
 *
 * <p>令牌来自环境变量 {@code ADMIN_DASHBOARD_TOKEN}（或同名 JVM 属性）。未配置时一律拒绝，
 * 避免「忘了配就等于无鉴权」。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class AdminDashboardAuthFilter extends OncePerRequestFilter {

  private static final String PREFIX = "/admin/api/";
  private static final String HEADER = "Authorization";
  private static final String BEARER = "Bearer ";

  private final ObjectMapper objectMapper;
  private final byte[] expected;

  public AdminDashboardAuthFilter(
      ObjectMapper objectMapper, @Value("${ADMIN_DASHBOARD_TOKEN:}") String token) {
    this.objectMapper = objectMapper;
    this.expected = token == null ? new byte[0] : token.trim().getBytes(StandardCharsets.UTF_8);
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    return path == null || !path.startsWith(PREFIX);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      filterChain.doFilter(request, response);
      return;
    }
    if (expected.length == 0) {
      writeError(response, HttpStatus.SERVICE_UNAVAILABLE, "看板令牌未配置（ADMIN_DASHBOARD_TOKEN）");
      return;
    }
    String header = request.getHeader(HEADER);
    if (header == null || !header.startsWith(BEARER)) {
      writeError(response, HttpStatus.UNAUTHORIZED, "缺少看板访问令牌");
      return;
    }
    byte[] provided = header.substring(BEARER.length()).trim().getBytes(StandardCharsets.UTF_8);
    if (!MessageDigest.isEqual(provided, expected)) {
      writeError(response, HttpStatus.UNAUTHORIZED, "看板访问令牌无效");
      return;
    }
    filterChain.doFilter(request, response);
  }

  private void writeError(HttpServletResponse response, HttpStatus status, String message)
      throws IOException {
    response.setStatus(status.value());
    response.setCharacterEncoding("UTF-8");
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setHeader("Cache-Control", "no-store");
    objectMapper.writeValue(
        response.getOutputStream(),
        ApiResponse.failure(
            status == HttpStatus.SERVICE_UNAVAILABLE ? "DASHBOARD_DISABLED" : "UNAUTHORIZED",
            message));
  }
}
