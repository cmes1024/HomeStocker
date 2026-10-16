package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NameRecallTest {

  @Test
  void matchesEveryCatalogNameInTheSentence() {
    assertEquals(List.of("鸡蛋", "盐"), NameRecall.match("鸡蛋和盐各加一个", List.of("盐", "鸡蛋", "牛奶")));
  }

  @Test
  void sameLengthNamesFollowSentenceOrder() {
    assertEquals(
        List.of("苹果", "电脑"),
        NameRecall.match("先把苹果改成3，再把电脑删掉", List.of("电脑", "苹果")));
  }

  @Test
  void longerNameConsumesTheInnerShorterName() {
    assertEquals(List.of("大米"), NameRecall.match("大米还有吗", List.of("米", "大米")));
  }

  @Test
  void shorterNameStillMatchesWhenItStandsAlone() {
    assertEquals(List.of("米"), NameRecall.match("米还有吗", List.of("米")));
  }

  @Test
  void singleCharacterInsideALongerWordDoesNotMatch() {
    assertTrue(NameRecall.match("这个厘米不该算米", List.of("米")).isEmpty());
  }

  @Test
  void emptyWhenNoCatalogNameOccurs() {
    assertTrue(NameRecall.match("今天天气怎么样", List.of("鸡蛋", "盐")).isEmpty());
  }

  @Test
  void skipsSingleAsciiCharacter() {
    assertTrue(NameRecall.match("a thing", List.of("a")).isEmpty());
  }

  @Test
  void probeNumbersContinueAfterRecallRefs() {
    Map<String, Map<String, Object>> refs = new LinkedHashMap<>();
    refs.put("P1", Map.of("ref", "P1"));
    refs.put("P2", Map.of("ref", "P2"));
    refs.put("F1", Map.of("ref", "F1"));
    assertEquals(3, ItemsProbe.nextProbeNumber(refs));
    assertEquals(1, ItemsProbe.nextProbeNumber(new LinkedHashMap<>()));
  }
}
