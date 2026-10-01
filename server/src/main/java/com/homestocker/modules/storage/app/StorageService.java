package com.homestocker.modules.storage.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.storage.ObjectStorageClient;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class StorageService {

  private static final Set<String> KINDS =
      Set.of("item", "space", "location", "avatar");

  /** 压缩后单图上限（小程序 maxEdge≈800 / quality≈55）。 */
  private static final long MAX_UPLOAD_BYTES = 4L * 1024 * 1024;

  private final ObjectStorageClient storageClient;

  public StorageService(ObjectStorageClient storageClient) {
    this.storageClient = storageClient;
  }

  public Map<String, Object> presign(Map<String, Object> body) {
    String openid = RequestContext.require().openid();
    String kind = normalizeKind(str(body.get("kind")));
    String contentType = normalizeContentType(str(body.get("contentType")));
    String ext = extOf(contentType, str(body.get("ext")));
    String objectKey = buildObjectKey(kind, openid, ext);
    String uploadUrl = storageClient.presignPut(objectKey, 15);
    String publicUrl = storageClient.publicUrl(objectKey);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("objectKey", objectKey);
    out.put("uploadUrl", uploadUrl);
    out.put("publicUrl", publicUrl);
    out.put("contentType", contentType);
    out.put("method", "PUT");
    return out;
  }

  /**
   * 小程序经 API 上传二进制图（默认路径；不必把 MinIO 配进 request 合法域名）。
   */
  public Map<String, Object> upload(
      String kindRaw, String contentTypeRaw, String extHint, InputStream body, long size) {
    String openid = RequestContext.require().openid();
    if (body == null || size <= 0) {
      throw ApiException.of(ErrorCodes.INVALID_IMAGE, "图片内容为空");
    }
    if (size > MAX_UPLOAD_BYTES) {
      throw ApiException.of(ErrorCodes.INVALID_IMAGE, "图片过大");
    }
    String kind = normalizeKind(kindRaw);
    String contentType = normalizeContentType(contentTypeRaw);
    String ext = extOf(contentType, extHint);
    String objectKey = buildObjectKey(kind, openid, ext);
    storageClient.putObject(objectKey, body, size, contentType);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("objectKey", objectKey);
    out.put("publicUrl", storageClient.publicUrl(objectKey));
    out.put("contentType", contentType);
    return out;
  }

  public Map<String, Object> remove(Map<String, Object> body) {
    RequestContext.require();
    String key = str(body.get("objectKey")).trim();
    if (key.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "objectKey 不能为空");
    }
    storageClient.removeQuietly(key);
    return Map.of("removed", true, "objectKey", key);
  }

  private static String buildObjectKey(String kind, String openid, String ext) {
    return kind + "/" + openid + "/" + System.currentTimeMillis() + "-" + UUID.randomUUID() + ext;
  }

  private static String normalizeKind(String kindRaw) {
    String kind = str(kindRaw).trim().toLowerCase();
    return KINDS.contains(kind) ? kind : "item";
  }

  private static String normalizeContentType(String raw) {
    String contentType = str(raw).trim();
    if (contentType.isEmpty()) {
      return "image/jpeg";
    }
    // 去掉 charset 等后缀
    int semi = contentType.indexOf(';');
    if (semi > 0) {
      contentType = contentType.substring(0, semi).trim();
    }
    return contentType.isEmpty() ? "image/jpeg" : contentType;
  }

  private static String extOf(String contentType, String extHint) {
    if (extHint != null && !extHint.isBlank()) {
      String e = extHint.trim();
      return e.startsWith(".") ? e : "." + e;
    }
    return switch (contentType) {
      case "image/png" -> ".png";
      case "image/webp" -> ".webp";
      case "image/gif" -> ".gif";
      default -> ".jpg";
    };
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
