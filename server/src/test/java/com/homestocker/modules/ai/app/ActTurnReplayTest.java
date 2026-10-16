package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.modules.ai.app.ActTurnReplay.Claim;
import com.homestocker.modules.ai.app.ActTurnReplay.Kind;
import com.homestocker.modules.ai.app.ActTurnReplay.SlotStore;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;

class ActTurnReplayTest {

  @Test
  void retryOfAFinishedTurnReplaysInsteadOfRunningAgain() {
    ActTurnReplay replay = new ActTurnReplay(new MemoryStore(), new ObjectMapper(), 0);
    String turnId = "turn-1234";

    assertEquals(Kind.PROCEED, replay.begin("openid", turnId).kind());
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("status", "done");
    payload.put("wrote", true);
    payload.put("lead", "已改 苹果：3");
    replay.succeed("openid", turnId, payload);

    Claim again = replay.begin("openid", turnId);
    assertEquals(Kind.REPLAY, again.kind());
    assertEquals(true, again.payload().get("wrote"));
    assertEquals("已改 苹果：3", again.payload().get("lead"));
  }

  @Test
  void aTurnStillRunningDoesNotStartAnotherWrite() {
    ActTurnReplay replay = new ActTurnReplay(new MemoryStore(), new ObjectMapper(), 0);
    String turnId = "turn-5678";

    assertEquals(Kind.PROCEED, replay.begin("openid", turnId).kind());
    assertEquals(Kind.BUSY, replay.begin("openid", turnId).kind());
  }

  @Test
  void aFailedTurnCanBeTriedAgain() {
    ActTurnReplay replay = new ActTurnReplay(new MemoryStore(), new ObjectMapper(), 0);
    String turnId = "turn-9999";

    replay.begin("openid", turnId);
    replay.fail("openid", turnId);
    assertEquals(Kind.PROCEED, replay.begin("openid", turnId).kind());
  }

  @Test
  void blankTurnIdIsNotRemembered() {
    assertTrue(ActTurnReplay.sanitize("short").isEmpty());
    assertTrue(ActTurnReplay.sanitize("bad id!!").isEmpty());
    ActTurnReplay replay = new ActTurnReplay(new MemoryStore(), new ObjectMapper(), 0);
    assertEquals(Kind.PROCEED, replay.begin("openid", "").kind());
    assertEquals(Kind.PROCEED, replay.begin("openid", "").kind());
  }

  private static final class MemoryStore implements SlotStore {
    private final Map<String, String> data = new ConcurrentHashMap<>();

    @Override
    public String get(String key) {
      return data.get(key);
    }

    @Override
    public boolean putIfAbsent(String key, String value, Duration ttl) {
      return data.putIfAbsent(key, value) == null;
    }

    @Override
    public void put(String key, String value, Duration ttl) {
      data.put(key, value);
    }

    @Override
    public void deleteIf(String key, String expected) {
      data.compute(key, (k, v) -> expected.equals(v) ? null : v);
    }
  }
}
