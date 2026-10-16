package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class ActBudgetTest {

  @Test
  void nextCallStaysInsideTheSharedBudget() {
    AtomicLong now = new AtomicLong(1_000);
    ActBudget budget = new ActBudget(1_000, 45_000, now::get);

    assertEquals(12_000, budget.nextCallMs(12_000));
    now.set(1_000 + 40_000);
    assertEquals(5_000, budget.nextCallMs(12_000));
    now.set(1_000 + 44_000);
    assertEquals(0, budget.nextCallMs(12_000));
  }
}
