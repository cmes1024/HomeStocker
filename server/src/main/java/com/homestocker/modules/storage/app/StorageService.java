package com.homestocker.modules.storage.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.storage.ObjectStorageClient;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class StorageService {

  private static final Set<String> KINDS =
      Set.of("item", "space", "location", "avatar");

  private final ObjectStorageClient storageClient;

  public StorageService(ObjectStorageClient storageClient) {
    this.storageClient = storageClient;
  }

  public Map<String, Object> presign(Map<String, Object> body) {
    String openid = RequestContext.require().openid();
    String kind = str(body.get("kind")).trim().toLowerCase();
    if (!KINDS.contains(kind)) {
      kind = "item";
    }
    String contentType = str(body.get("contentType")).trim();
    if (contentType.isEmpty()) {
      contentType = "image/jpeg";
    }
    String ext = extOf(contentType, str(body.get("ext")));
    String objectKey =
        kind + "/" + openid + "/" + System.currentTimeMillis() + "-" + UUID.randomUUID() + ext;
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

  public Map<String, Object> remove(Map<String, Object> body) {
    RequestContext.require();
    String key = str(body.get("objectKey")).trim();
    if (key.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "objectKey 不能为空");
    }
    storageClient.removeQuietly(key);
    return Map.of("removed", true, "objectKey", key);
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
