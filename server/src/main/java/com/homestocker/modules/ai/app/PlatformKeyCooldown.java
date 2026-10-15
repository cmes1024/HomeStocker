package com.homestocker.modules.ai.app;

import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class PlatformKeyCooldown {

  private final ConcurrentHashMap<String, Long> until = new ConcurrentHashMap<>();

  public boolean cooling(String keyId, long nowMs) {
    Long end = until.get(keyId);
    if (end == null) {
      return false;
    }
    if (end <= nowMs) {
      until.remove(keyId, end);
      return false;
    }
    return true;
  }

  public void cool(String keyId, long nowMs) {
    until.put(keyId, PlatformKeyFailover.cooldownUntil(() -> nowMs));
  }
}
