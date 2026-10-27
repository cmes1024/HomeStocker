package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ReplyRedactorTest {

  @Test
  void toolIdBecomesFamilyLanguage() {
    String out = ReplyRedactor.redact("先调 item_search 查全库，再用 present 画表");
    assertFalse(out.contains("item_search"));
    assertFalse(out.contains("present"));
    assertTrue(out.contains("查库"));
    assertTrue(out.contains("表格"));
  }

  @Test
  void underscoredToolNamesAreAlsoRedacted() {
    String out = ReplyRedactor.redact("item_stats 统计一下");
    assertFalse(out.contains("item_stats"));
    assertTrue(out.contains("统计"));
  }

  @Test
  void unknownToolIdsFallBackToNeutralWord() {
    String out = ReplyRedactor.redact("调用 family.secret 看看");
    assertFalse(out.contains("family.secret"));
    assertTrue(out.contains("后台工具"));
  }

  @Test
  void pseudoToolCallXmlIsDropped() {
    String raw =
        "好的\n<tool_call>\n<function=present>\n<parameter=type>\ntable\n</parameter>\n";
    assertEquals("好的", ReplyRedactor.stripPseudoCalls(raw));
  }

  @Test
  void pseudoCallOnlyLeavesNothing() {
    String raw = "<tool_call>\n<function=present>\n<parameter=title>\n未挂标签物资\n</parameter>";
    assertEquals("", ReplyRedactor.stripPseudoCalls(raw));
  }

  @Test
  void normalReplyIsUntouched() {
    String raw = "共14件未挂标签，其中牛奶和酸奶已过期。";
    assertEquals(raw, ReplyRedactor.stripPseudoCalls(raw));
    assertEquals(raw, ReplyRedactor.redact(raw));
  }
}
