package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ReplyTableGuardTest {

  @Test
  void stripsHeaderAndDotRows() {
    String text =
        """
        厨房共 9 条记录，酸奶已过期 1 天，牛奶今日到期。
        厨房现有物资
        名称 / 数量 / 位置 / 备注 / 说明
        酸奶·2盒·厨房 / 冰箱·已过期 1 天
        牛奶·2盒·厨房 / 冰箱·今日到期
        鸡蛋·8个·厨房 / 冰箱""";
    ReplyTableGuard.Result out = ReplyTableGuard.strip(text);
    assertTrue(out.stripped());
    assertEquals("厨房共 9 条记录，酸奶已过期 1 天，牛奶今日到期。\n厨房现有物资", out.text());
  }

  @Test
  void keepsPlainSentence() {
    String text = "厨房共 11 件记录，牛奶有两条，一条在冰箱。";
    ReplyTableGuard.Result out = ReplyTableGuard.strip(text);
    assertFalse(out.stripped());
    assertEquals(text, out.text());
  }

  @Test
  void sentenceWithSlashIsNotAHeader() {
    // 「空间/位置」这种单个斜杠是正常中文；以前会被当成表头，整句删掉后整轮降级
    String text = "能看到名称、数量、所在空间/位置、过期时间、备注。";
    ReplyTableGuard.Result out = ReplyTableGuard.strip(text);
    assertFalse(out.stripped());
    assertEquals(text, out.text());
  }

  @Test
  void singleDotLineIsNotATable() {
    String text = "牛奶 2 盒·冰箱\n酸奶明天到期。";
    ReplyTableGuard.Result out = ReplyTableGuard.strip(text);
    assertFalse(out.stripped());
  }

  @Test
  void twoDotLinesWithoutHeaderAreStripped() {
    String text =
        """
        厨房里这些：
        牛奶·2盒·冰箱
        鸡蛋·8个·冰箱""";
    ReplyTableGuard.Result out = ReplyTableGuard.strip(text);
    assertTrue(out.stripped());
    assertEquals("厨房里这些：", out.text());
  }
}
