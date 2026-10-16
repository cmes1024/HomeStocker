package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.homestocker.infra.jdbc.ItemRow;
import java.util.List;
import org.junit.jupiter.api.Test;

class ItemsProbeNameMatchTest {

  @Test
  void exactNameDropsLongerNamesThatOnlyContainIt() {
    List<ItemRow> matched = ItemsProbe.filterByName(List.of(row("大米"), row("米")), List.of("米"));
    assertEquals(List.of("米"), names(matched));
  }

  @Test
  void exactLongerNameDoesNotPullTheShorterOne() {
    List<ItemRow> matched = ItemsProbe.filterByName(List.of(row("大米"), row("米")), List.of("大米"));
    assertEquals(List.of("大米"), names(matched));
  }

  @Test
  void fragmentStillMatchesWhenNothingHasThatExactName() {
    List<ItemRow> matched = ItemsProbe.filterByName(List.of(row("牛奶"), row("酸奶")), List.of("奶"));
    assertEquals(List.of("牛奶", "酸奶"), names(matched));
  }

  private static ItemRow row(String name) {
    return new ItemRow(
        name,
        "family",
        name,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.<String>of(),
        List.<String>of());
  }

  private static List<String> names(List<ItemRow> rows) {
    return rows.stream().map(ItemRow::name).toList();
  }
}
