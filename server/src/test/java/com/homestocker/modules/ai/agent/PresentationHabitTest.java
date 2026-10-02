package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PresentationHabitTest {

  @Test
  void habitListIsModelOnlyNotUserBubble() {
    Presentation.PresentationView view =
        Presentation.buildExecutionPresentation(
            List.of(
                Map.of(
                    "use",
                    "habit.list",
                    "summary",
                    "habit.list 1\n- 默认落点(default_space)：没说地点就放客厅",
                    "habits",
                    List.of(
                        Map.of(
                            "slot",
                            "default_space",
                            "label",
                            "默认落点",
                            "text",
                            "没说地点就放客厅")))),
            List.of(),
            List.of(),
            Map.of());
    assertEquals("", view.lead());
    assertTrue(view.blocks().isEmpty());
    assertTrue(view.lines().isEmpty());
  }
}
