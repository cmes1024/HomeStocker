package com.homestocker.modules.ai.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.homestocker.common.ErrorCodes;
import com.homestocker.modules.ai.agent.ActContextBuilder.ActContext;
import com.homestocker.modules.ai.agent.ActPrompt.ActModelException;
import com.homestocker.modules.ai.agent.ActPrompt.ModelOpts;
import com.homestocker.modules.ai.agent.ActToolLoop.Kind;
import com.homestocker.modules.ai.agent.ActToolLoop.Outcome;
import com.homestocker.modules.ai.infra.DeepSeekClient.ChatResult;
import com.homestocker.modules.ai.infra.DeepSeekClient.ToolCall;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class ActToolLoopTest {

  @Test
  void updateBesideRemoveIsNotWrittenBeforeConfirm() throws Exception {
    List<String> executed = new ArrayList<>();
    Outcome outcome =
        loop(
                List.of(
                    result(
                        call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":3}"),
                        call("2", "item_remove", "{\"ref\":\"P2\"}"))))
            .run(context(), null, calls -> {
              executed.add(String.valueOf(calls.get(0).get("use")));
              return receipt(false, "已改 苹果：3");
            });

    assertTrue(executed.isEmpty());
    assertEquals(Kind.CONFIRM, outcome.kind());
    assertEquals("item.update", outcome.calls().get(0).get("use"));
    assertEquals(3, outcome.calls().get(0).get("quantity"));
    assertEquals("item.remove", outcome.calls().get(1).get("use"));
    assertEquals("P1", outcome.calls().get(0).get("ref"));
    assertEquals("P2", outcome.calls().get(1).get("ref"));
  }

  @Test
  void askDoesNotCommitTheWriteInTheSameBatch() throws Exception {
    List<String> executed = new ArrayList<>();
    Outcome outcome =
        loop(
                List.of(
                    result(
                        call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":3}"),
                        call("2", "ask", "{\"question\":\"单位用什么？\",\"options\":[\"个\",\"斤\"]}"))))
            .run(context(), null, calls -> {
              executed.add(String.valueOf(calls.get(0).get("use")));
              return receipt(true, "已改 苹果：3");
            });

    assertTrue(executed.isEmpty());
    assertEquals(Kind.ASK, outcome.kind());
    assertTrue(outcome.calls().isEmpty());
    assertEquals("单位用什么？", outcome.ask().get(0).get("question"));
  }

  @Test
  void earlierWriteStaysVisibleWhenALaterStepAsks() throws Exception {
    Outcome outcome =
        loop(
                List.of(
                    result(call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":3}")),
                    result(call("2", "ask", "{\"question\":\"还要改电脑吗？\",\"options\":[]}"))))
            .run(context(), null, calls -> receipt(true, "已改 苹果：3"));

    assertEquals(Kind.ASK, outcome.kind());
    assertEquals("item.update", outcome.calls().get(0).get("use"));
    assertEquals(true, outcome.report().get("wrote"));
    assertTrue(String.valueOf(outcome.report().get("lead")).contains("苹果"));
  }

  @Test
  void stepCapKeepsTheWritesInsteadOfABlankAsk() throws Exception {
    AtomicInteger hits = new AtomicInteger();
    List<ChatResult> script = new ArrayList<>();
    for (int i = 0; i < 4; i++) {
      script.add(result(call("c" + i, "item_update", "{\"ref\":\"P1\",\"quantity\":" + (i + 1) + "}")));
    }
    Outcome outcome =
        loop(script)
            .run(context(), null, calls -> {
              hits.incrementAndGet();
              return receipt(true, "已改 苹果：" + calls.get(0).get("quantity"));
            });

    assertEquals(4, hits.get());
    assertEquals(Kind.DONE, outcome.kind());
    assertEquals(4, outcome.calls().size());
    assertEquals(true, outcome.report().get("wrote"));
  }

  @Test
  void laterSearchDoesNotEraseTheEarlierWriteCard() throws Exception {
    Outcome outcome =
        loop(
                List.of(
                    result(call("1", "item_create", "{\"name\":\"泡面\",\"quantity\":2,\"spaceName\":\"厨房\"}")),
                    result(call("2", "item_search", "{\"spaceName\":\"厨房\"}")),
                    new ChatResult("厨房里现在有这些。", 200, 1)))
            .run(
                context("厨房记两包泡面"),
                null,
                calls -> {
                  String use = String.valueOf(calls.get(0).get("use"));
                  if ("item.create".equals(use)) {
                    return receipt(true, "已记下 泡面：2袋");
                  }
                  Map<String, Object> row = new LinkedHashMap<>();
                  row.put("use", "item.search");
                  row.put("summary", "查询：找到 1 件");
                  row.put("inventory", List.of(Map.of("name", "泡面", "quantity", 2)));
                  row.put("executed", List.of(row));
                  row.put("failed", List.of());
                  row.put("wrote", false);
                  return row;
                });

    assertEquals(Kind.DONE, outcome.kind());
    String shown = String.valueOf(outcome.report().get("lines"));
    assertTrue(shown.contains("泡面"), shown);
    assertTrue(shown.contains("查询") || shown.contains("找到"), shown);
  }

  private static ActToolLoop loop(List<ChatResult> script) {
    return new ActToolLoop(null, new ObjectMapper()) {
      private int cursor;

      @Override
      ChatResult complete(ActPrompt.ModelOpts opts, ArrayNode messages, ArrayNode tools) {
        return script.get(cursor++);
      }
    };
  }

  private static ActContext context() {
    return context("先把苹果改成3，再把电脑删掉");
  }

  @Test
  void timeBudgetAfterAWriteReturnsTheReceipt() throws Exception {
    AtomicLong now = new AtomicLong(0);
    ActBudget budget = new ActBudget(0, 10_000, now::get);
    ModelOpts opts = new ModelOpts(List.of(), 12_000, 800, List.of(), false, budget);
    AtomicInteger hits = new AtomicInteger();
    Outcome outcome =
        new ActToolLoop(null, new ObjectMapper()) {
          @Override
          ChatResult complete(ModelOpts ignored, ArrayNode messages, ArrayNode tools) {
            now.set(10_000);
            return result(call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":3}"));
          }
        }.run(
            context(),
            opts,
            calls -> {
              hits.incrementAndGet();
              return receipt(true, "已改 苹果：3");
            });

    assertEquals(1, hits.get());
    assertEquals(Kind.DONE, outcome.kind());
    assertEquals(true, outcome.report().get("wrote"));
  }

  @Test
  void modelFailureAfterAWriteReturnsTheReceipt() throws Exception {
    AtomicInteger hits = new AtomicInteger();
    Outcome outcome =
        new ActToolLoop(null, new ObjectMapper()) {
          private int n;

          @Override
          ChatResult complete(ModelOpts ignored, ArrayNode messages, ArrayNode tools)
              throws ActModelException {
            if (n++ > 0) {
              throw new ActModelException(ErrorCodes.ACT_FAILED, "timeout");
            }
            return result(call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":3}"));
          }
        }.run(
            context(),
            null,
            calls -> {
              hits.incrementAndGet();
              return receipt(true, "已改 苹果：3");
            });

    assertEquals(1, hits.get());
    assertEquals(Kind.DONE, outcome.kind());
    assertEquals(true, outcome.report().get("wrote"));
  }

  @Test
  void timeBudgetBeforeAnyWriteAsksAgain() throws Exception {
    ActBudget budget = new ActBudget(0, 10_000, () -> 10_000L);
    ModelOpts opts = new ModelOpts(List.of(), 12_000, 800, List.of(), false, budget);
    AtomicInteger hits = new AtomicInteger();
    Outcome outcome =
        loop(List.of(result(call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":3}"))))
            .run(
                context(),
                opts,
                calls -> {
                  hits.incrementAndGet();
                  return receipt(true, "已改 苹果：3");
                });

    assertEquals(0, hits.get());
    assertEquals(Kind.ASK, outcome.kind());
  }

  @Test
  void blankSearchIsNotTheAnswerUntilTheModelSpeaks() throws Exception {
    Outcome outcome =
        loop(
                List.of(
                    result(call("1", "item_search", "{\"name\":\"牛奶\"}")),
                    new ChatResult("", List.of(), 200, 1),
                    new ChatResult("冰箱那盒喝完还剩 1 盒。", List.of(), 200, 1)))
            .run(
                context("牛奶我从冰箱拿了一盒喝了"),
                null,
                calls -> {
                  Map<String, Object> row = new LinkedHashMap<>();
                  row.put("use", "item.search");
                  row.put("summary", "查询：找到 2 件");
                  row.put("executed", List.of(row));
                  row.put("failed", List.of());
                  row.put("wrote", false);
                  return row;
                });

    assertEquals(Kind.DONE, outcome.kind());
    assertTrue(outcome.reply().contains("还剩 1 盒"));
  }

  @Test
  void sameNameUpdateIsNotExecuted() throws Exception {
    AtomicInteger hits = new AtomicInteger();
    List<Map<String, Object>> rows = new ArrayList<>();
    rows.add(milk("P1", "m1", "2", "冰箱", ""));
    rows.add(milk("P2", "m2", "1", "", "常温未开"));
    Outcome outcome =
        loop(
                List.of(
                    result(call("1", "item_update", "{\"name\":\"牛奶\",\"quantity\":1}")),
                    result(call("2", "ask", "{\"question\":\"喝的是冰箱那盒，还是常温那盒？\",\"options\":[]}"))))
            .run(
                context("牛奶和酸奶各喝一盒", rows),
                null,
                calls -> {
                  hits.incrementAndGet();
                  return receipt(true, "已改");
                });

    assertEquals(0, hits.get());
    assertEquals(Kind.ASK, outcome.kind());
    assertTrue(outcome.calls().isEmpty());
  }

  @Test
  void sameNameUpdateByUniqueRefIsExecuted() throws Exception {
    AtomicInteger hits = new AtomicInteger();
    List<Map<String, Object>> rows = new ArrayList<>();
    rows.add(milk("P1", "m1", "2", "冰箱", ""));
    rows.add(milk("P2", "m2", "1", "", "常温未开"));
    Outcome outcome =
        loop(
                List.of(
                    result(call("1", "item_update", "{\"ref\":\"P1\",\"quantity\":1}")),
                    new ChatResult("已改 牛奶：1", 200, 1)))
            .run(
                context("牛奶和酸奶各喝一盒", rows),
                null,
                calls -> {
                  hits.incrementAndGet();
                  return receipt(true, "已改");
                });

    assertEquals(1, hits.get());
    assertEquals(Kind.DONE, outcome.kind());
    assertEquals("item.update", outcome.calls().get(0).get("use"));
  }

  private static ActContext context(String userText) {
    return context(userText, new ArrayList<>());
  }

  private static ActContext context(String userText, List<Map<String, Object>> turnRows) {
    Map<String, Map<String, Object>> catalog = new LinkedHashMap<>();
    catalog.put("item.update", api("item.update", false, "ref, quantity?"));
    catalog.put("item.remove", api("item.remove", true, "ref"));
    catalog.put("item.create", api("item.create", false, "name, quantity?, spaceName"));
    catalog.put("item.search", api("item.search", false, "name?, spaceName?"));
    catalog.put("ask", api("ask", false, "question"));
    return new ActContext(
        "openid",
        "family",
        catalog,
        Map.of(),
        Map.of(
            "spaces",
            List.of(
                Map.of("name", "厨房", "locations", List.of(Map.of("name", "冰箱"), Map.of("name", "橱柜"))),
                Map.of("name", "客厅", "locations", List.of()))),
        "家",
        Map.of("ymd", "2026-10-15", "weekday", "四"),
        new LinkedHashMap<>(),
        List.of(),
        null,
        turnRows,
        Map.of(),
        "",
        userText,
        userText);
  }

  private static Map<String, Object> milk(
      String ref, String itemId, String quantity, String location, String note) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("ref", ref);
    row.put("itemId", itemId);
    row.put("name", "牛奶");
    row.put("quantity", new BigDecimal(quantity));
    row.put("unit", "盒");
    row.put("spaceName", "厨房");
    row.put("locationName", location);
    row.put("note", note);
    return row;
  }

  private static Map<String, Object> api(String id, boolean confirm, String args) {
    Map<String, Object> api = new LinkedHashMap<>();
    api.put("id", id);
    api.put("enabled", true);
    api.put("confirm", confirm);
    api.put("hint", id);
    api.put("args", args);
    return api;
  }

  private static ChatResult result(ToolCall... calls) {
    return new ChatResult("", List.of(calls), 200, 1);
  }

  private static ToolCall call(String id, String name, String arguments) {
    return new ToolCall(id, name, arguments);
  }

  private static Map<String, Object> receipt(boolean wrote, String summary) {
    Map<String, Object> executed = new LinkedHashMap<>();
    executed.put("use", "item.update");
    executed.put("summary", summary);
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("executed", List.of(executed));
    report.put("failed", List.of());
    report.put("navLinks", List.of());
    report.put("wrote", wrote);
    report.put("lead", summary);
    report.put("blocks", List.of(Map.of("cards", List.of(Map.of("title", summary)))));
    report.put("lines", List.of(summary));
    return report;
  }
}
