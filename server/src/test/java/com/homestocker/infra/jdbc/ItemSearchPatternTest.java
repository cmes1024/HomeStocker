package com.homestocker.infra.jdbc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** item.search 的 LIKE 模式串：用户输入里的通配符必须按字面量匹配。 */
class ItemSearchPatternTest {

  @Test
  void plainKeywordWrapped() {
    assertEquals("%牛奶%", ItemRepository.likePattern("牛奶"));
    assertEquals("%milk%", ItemRepository.likePattern("  milk  "));
  }

  @Test
  void wildcardsAreEscaped() {
    assertEquals("%50\\%%", ItemRepository.likePattern("50%"));
    assertEquals("%a\\_b%", ItemRepository.likePattern("a_b"));
    assertEquals("%c\\\\d%", ItemRepository.likePattern("c\\d"));
  }
}
