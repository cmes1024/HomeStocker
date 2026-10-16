package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import org.junit.jupiter.api.Test;

class VisibleReplyTest {

  @Test
  void stripsImitatedStampAnywhere() {
    assertEquals(
        "冰箱里现在有 1 件东西：苹果 1斤，在厨房 / 冰箱。",
        PlanParser.stripImitatedStamp("冰箱里现在有 1 件东西：苹果 1斤，在厨房 / 冰箱。（消息时间 2026-10-15 20:10）"));
    assertEquals("盐还有。", PlanParser.stripImitatedStamp("[2026-10-15 20:10] 盐还有。（消息时间 2026-10-15 20:10）"));
  }

  @Test
  void spokenSuccessWithoutAWriteIsNotAReceipt() {
    assertEquals(true, ActToolLoop.unbackedWriteClaim("已记上：泡面 2袋，在厨房。", null));
    assertEquals(false, ActToolLoop.unbackedWriteClaim("已记上：泡面 2袋，在厨房。", Map.of("wrote", true)));
    assertEquals(true, ActToolLoop.unbackedWriteClaim("放好了，泡面在厨房。", null));
    assertEquals(false, ActToolLoop.unbackedWriteClaim("确实没有泡面，要不要补上？", null));
  }

  @Test
  void presentSpecKeepsTypeAndDropsInventedCells() {
    Map<String, Object> spec =
        ActToolLoop.presentSpec(
            Map.of("type", "bars", "groupBy", "space", "title", "各空间", "rows", "自编"));
    assertEquals("bars", spec.get("type"));
    assertEquals("space", spec.get("groupBy"));
    assertEquals("probe", spec.get("source"));
    assertNull(spec.get("rows"));
  }
}
