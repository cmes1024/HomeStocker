package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 管家 probe 有关键字时必须下推 SQL，且保留「精确同名优先」的旧语义。 */
class ItemsProbeKeywordPushdownTest {

  private static ItemRow row(String name) {
    return new ItemRow(
        "id-" + name,
        "fam",
        name,
        BigDecimal.ONE,
        "",
        "",
        "sp",
        null,
        null,
        null,
        "openid",
        "ui",
        null,
        null,
        List.of(),
        List.of());
  }

  private static final class FakeRepo extends ItemRepository {
    List<String> searchedKeywords;
    boolean listCalled;

    FakeRepo() {
      super(null);
    }

    @Override
    public List<ItemRow> searchAny(
        String familyId,
        String spaceId,
        String tagId,
        BigDecimal maxQuantity,
        List<String> keywords,
        int limit) {
      searchedKeywords = new ArrayList<>(keywords);
      return List.of(row("牛奶粉"), row("牛奶"));
    }

    @Override
    public List<ItemRow> list(
        String familyId, String spaceId, String tagId, BigDecimal maxQuantity, int limit) {
      listCalled = true;
      return List.of(row("米"));
    }
  }

  @Test
  void keywordSearchGoesToSqlAndKeepsExactMatchPriority() {
    FakeRepo repo = new FakeRepo();
    ItemsProbe probe = new ItemsProbe(repo);

    List<ItemRow> got = probe.listItemsCompact("fam", null, null, List.of("牛奶"), 100);

    // 命中集来自 SQL 下推；精确同名把「牛奶粉」滤掉，与旧的内存过滤语义一致
    assertEquals(List.of("牛奶"), repo.searchedKeywords);
    assertFalse(repo.listCalled, "有关键字时不应再走无过滤的 list");
    assertEquals(1, got.size());
    assertEquals("牛奶", got.get(0).name());
  }

  @Test
  void noKeywordStillUsesPlainList() {
    FakeRepo repo = new FakeRepo();
    ItemsProbe probe = new ItemsProbe(repo);

    List<ItemRow> got = probe.listItemsCompact("fam", null, null, List.of(), 40);

    assertTrue(repo.listCalled);
    assertEquals(null, repo.searchedKeywords);
    assertEquals(1, got.size());
  }
}
