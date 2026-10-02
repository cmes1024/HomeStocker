package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TreeMatchExactSpaceTest {

  @Test
  void exactSpaceNameRejectsCompoundProse() {
    Map<String, Object> tree =
        Map.of("spaces", List.of(Map.of("id", "s1", "name", "客厅"), Map.of("id", "s2", "name", "冰箱")));

    assertEquals("客厅", TreeMatch.exactSpaceName(tree, "客厅"));
    assertNull(TreeMatch.exactSpaceName(tree, "没说放哪儿时默认放客厅；饮料默认放冰箱"));
    assertNull(TreeMatch.exactSpaceName(tree, "默认放客厅"));
    // fuzzy matchSpace may still hit; exact must not
    assertEquals("客厅", TreeMatch.matchSpace(tree, "默认放客厅").get("name"));
  }
}
