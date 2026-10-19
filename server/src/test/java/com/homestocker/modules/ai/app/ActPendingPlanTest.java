package com.homestocker.modules.ai.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ActPendingPlanTest {

  private static final ObjectMapper OM = new ObjectMapper();

  static final class FakeStore implements ActPendingPlan.Store {
    final Map<String, String> map = new HashMap<>();

    @Override
    public String get(String key) {
      return map.get(key);
    }

    @Override
    public void put(String key, String value, Duration ttl) {
      map.put(key, value);
    }

    @Override
    public void delete(String key) {
      map.remove(key);
    }
  }

  private static ActPendingPlan plan(FakeStore store) {
    return new ActPendingPlan(store, OM);
  }

  @Test
  void saveThenPeekRoundTripsCalls() {
    FakeStore store = new FakeStore();
    ActPendingPlan plan = plan(store);

    String planId =
        plan.save(
            "open-1",
            List.of(
                Map.of("use", "item.update", "itemId", "i-1", "quantity", 2.5),
                Map.of("use", "item.delete", "itemId", "i-2")));

    assertFalse(planId.isEmpty());
    List<Map<String, Object>> back = plan.peek("open-1", planId);
    assertEquals(2, back.size());
    assertEquals("item.update", back.get(0).get("use"));
    assertEquals(2.5, ((Number) back.get(0).get("quantity")).doubleValue(), 1e-9);
    assertEquals("item.delete", back.get(1).get("use"));

    // 读不删：执行失败可以用同一份重试
    assertEquals(2, plan.peek("open-1", planId).size());
    plan.clear("open-1", planId);
    assertNull(plan.peek("open-1", planId));
  }

  @Test
  void peekIsScopedByOpenid() {
    FakeStore store = new FakeStore();
    ActPendingPlan plan = plan(store);
    String planId = plan.save("open-1", List.of(Map.of("use", "item.delete", "itemId", "i-1")));

    assertNull(plan.peek("open-2", planId));
    assertEquals(1, plan.peek("open-1", planId).size());
  }

  @Test
  void tamperedCallsDoNotEqualOriginal() {
    FakeStore store = new FakeStore();
    ActPendingPlan plan = plan(store);
    String planId = plan.save("open-1", List.of(Map.of("use", "item.delete", "itemId", "i-1")));

    List<Map<String, Object>> expected = plan.peek("open-1", planId);
    // 换目标 / 换动作 / 少一条都必须被判为不一致
    assertNotEquals(expected, List.of(Map.of("use", "item.delete", "itemId", "i-2")));
    assertNotEquals(expected, List.of(Map.of("use", "item.update", "itemId", "i-1")));
    assertNotEquals(expected, List.of());
    assertEquals(expected, List.of(Map.of("use", "item.delete", "itemId", "i-1")));
  }

  @Test
  void emptyCallsOrOpenidSaveNothing() {
    ActPendingPlan plan = plan(new FakeStore());
    assertTrue(plan.save("", List.of(Map.of("use", "item.delete"))).isEmpty());
    assertTrue(plan.save("open-1", List.of()).isEmpty());
    assertTrue(plan.save(null, List.of(Map.of("use", "item.delete"))).isEmpty());
  }

  @Test
  void sanitizeRejectsMalformedPlanIds() {
    assertEquals("", ActPendingPlan.sanitize(null));
    assertEquals("", ActPendingPlan.sanitize("short"));
    assertEquals("", ActPendingPlan.sanitize("has space in it"));
    assertEquals("", ActPendingPlan.sanitize("中文不合法编号abc"));
    assertEquals("abc12345", ActPendingPlan.sanitize(" abc12345 "));
  }
}
