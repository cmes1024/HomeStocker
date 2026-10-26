package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 行文本必须带标签名，否则模型答不出「哪些没挂标签 / 这件挂的是什么」。 */
class ActRefsTagTest {

  private static Map<String, Object> tree() {
    Map<String, Object> tag = new LinkedHashMap<>();
    tag.put("id", "t1");
    tag.put("name", "食品");
    Map<String, Object> tree = new LinkedHashMap<>();
    tree.put("spaces", List.of());
    tree.put("tags", List.of(tag));
    return tree;
  }

  private static Map<String, Object> item(String id, String name, Object tagIds) {
    Map<String, Object> item = new LinkedHashMap<>();
    item.put("_id", id);
    item.put("name", name);
    item.put("quantity", 1);
    if (tagIds != null) {
      item.put("tagIds", tagIds);
    }
    return item;
  }

  @Test
  void compactRowResolvesTagIdsToNames() {
    Map<String, Object> row =
        ActRefs.compactItem(item("i1", "牛奶", List.of("t1")), "P1", tree());
    assertEquals(List.of("食品"), row.get("tagNames"));
    assertTrue(ActRefs.renderFocus(row).contains("标签 食品"));
  }

  @Test
  void rowWithoutTagsSaysSoExplicitly() {
    Map<String, Object> row = ActRefs.compactItem(item("i2", "盐", List.of()), "P2", tree());
    assertTrue(ActRefs.renderFocus(row).contains("无标签"));
  }

  @Test
  void rowWithoutTagFieldDoesNotClaimUntagged() {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("ref", "P3");
    row.put("name", "糖");
    row.put("quantity", 1);
    assertFalse(ActRefs.renderFocus(row).contains("无标签"));
  }

  @Test
  void missingTagsListsOnlyUnknownNames() {
    assertEquals(List.of("饮料"), TreeMatch.missingTags(tree(), List.of("食品", "饮料")));
  }
}
