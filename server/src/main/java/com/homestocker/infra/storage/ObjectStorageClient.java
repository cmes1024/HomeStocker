package com.homestocker.infra.storage;

import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.config.HomestockerProperties;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.SetBucketPolicyArgs;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ObjectStorageClient {

  private static final Logger log = LoggerFactory.getLogger(ObjectStorageClient.class);

  private final HomestockerProperties properties;
  /** API 容器内访问（Compose: http://minio:9000）。 */
  private MinioClient minio;
  /**
   * 给小程序/浏览器签预签名用（host 必须是客户端实际访问的地址）。
   * 若与 {@link #minio} 同 endpoint 则共用。
   */
  private MinioClient minioPresign;

  public ObjectStorageClient(HomestockerProperties properties) {
    this.properties = properties;
  }

  @PostConstruct
  public void init() {
    var s = properties.getStorage();
    try {
      minio =
          MinioClient.builder()
              .endpoint(s.getEndpoint())
              .credentials(s.getAccessKey(), s.getSecretKey())
              .region("us-east-1")
              .build();
      String pub = trimSlash(s.resolvePublicEndpoint());
      String internal = trimSlash(s.getEndpoint());
      if (!pub.isEmpty() && !pub.equals(internal)) {
        // region 固定后 getPresignedObjectUrl 不需要访问 public endpoint（容器内 127.0.0.1 不可达）。
        minioPresign =
            MinioClient.builder()
                .endpoint(pub)
                .credentials(s.getAccessKey(), s.getSecretKey())
                .region("us-east-1")
                .build();
      } else {
        minioPresign = minio;
      }
      boolean exists =
          minio.bucketExists(BucketExistsArgs.builder().bucket(s.getBucket()).build());
      if (!exists) {
        minio.makeBucket(MakeBucketArgs.builder().bucket(s.getBucket()).build());
        log.info("Created MinIO bucket {}", s.getBucket());
      }
      ensurePublicReadPolicy(s.getBucket());
    } catch (Exception e) {
      // Local machines without MinIO can still boot API for code-only development.
      log.warn("MinIO init skipped/failed: {}", e.getMessage());
      minio = null;
      minioPresign = null;
    }
  }

  public String presignPut(String objectKey, int expiryMinutes) {
    requirePresignClient();
    try {
      // 必须用公网 endpoint 签名：SigV4 含 Host，改写 URL 会导致 SignatureDoesNotMatch。
      return minioPresign.getPresignedObjectUrl(
          io.minio.GetPresignedObjectUrlArgs.builder()
              .method(Method.PUT)
              .bucket(properties.getStorage().getBucket())
              .object(objectKey)
              .expiry(Math.max(1, expiryMinutes), TimeUnit.MINUTES)
              .build());
    } catch (Exception e) {
      log.error(
          "presignPut failed key={} publicEndpoint={}",
          objectKey,
          properties.getStorage().resolvePublicEndpoint(),
          e);
      throw ApiException.of(ErrorCodes.INTERNAL, "生成上传地址失败");
    }
  }

  /** 服务端代写对象（小程序经 API 上传，不必直连 MinIO）。 */
  public void putObject(String objectKey, InputStream stream, long size, String contentType) {
    requireMinio();
    if (stream == null || size <= 0) {
      throw ApiException.of(ErrorCodes.INVALID_IMAGE, "图片内容为空");
    }
    try {
      PutObjectArgs.Builder builder =
          PutObjectArgs.builder()
              .bucket(properties.getStorage().getBucket())
              .object(objectKey)
              .stream(stream, size, -1);
      if (contentType != null && !contentType.isBlank()) {
        builder.contentType(contentType.trim());
      }
      minio.putObject(builder.build());
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      log.error("putObject failed key={}", objectKey, e);
      throw ApiException.of(ErrorCodes.INTERNAL, "图片上传失败");
    }
  }

  public String publicUrl(String objectKey) {
    String endpoint = trimSlash(properties.getStorage().resolvePublicEndpoint());
    return endpoint + "/" + properties.getStorage().getBucket() + "/" + objectKey;
  }

  public void removeQuietly(String objectKey) {
    if (minio == null || objectKey == null || objectKey.isBlank()) {
      return;
    }
    try {
      minio.removeObject(
          RemoveObjectArgs.builder()
              .bucket(properties.getStorage().getBucket())
              .object(objectKey)
              .build());
    } catch (Exception e) {
      log.warn("remove object failed key={}", objectKey, e);
    }
  }

  private void ensurePublicReadPolicy(String bucket) {
    // Local MinIO: allow anonymous GET so <image src="publicUrl"> works in DevTools.
    // Production should use COS/OSS public-read or CDN; tighten as needed.
    String policy =
        """
        {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Principal": {"AWS": ["*"]},
              "Action": ["s3:GetObject"],
              "Resource": ["arn:aws:s3:::%s/*"]
            }
          ]
        }
        """
            .formatted(bucket);
    try {
      minio.setBucketPolicy(
          SetBucketPolicyArgs.builder().bucket(bucket).config(policy).build());
    } catch (Exception e) {
      log.warn("MinIO setBucketPolicy skipped/failed: {}", e.getMessage());
    }
  }

  private static String trimSlash(String endpoint) {
    if (endpoint == null) {
      return "";
    }
    String e = endpoint.trim();
    while (e.endsWith("/")) {
      e = e.substring(0, e.length() - 1);
    }
    return e;
  }

  private void requireMinio() {
    if (minio == null) {
      throw ApiException.of(ErrorCodes.INTERNAL, "对象存储未就绪（请启动 MinIO）");
    }
  }

  private void requirePresignClient() {
    requireMinio();
    if (minioPresign == null) {
      throw ApiException.of(ErrorCodes.INTERNAL, "对象存储未就绪（请启动 MinIO）");
    }
  }
}
