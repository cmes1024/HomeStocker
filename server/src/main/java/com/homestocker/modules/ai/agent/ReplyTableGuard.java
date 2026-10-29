package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.List;

/**
 * 正文里手写的表格不算展示：一律删掉整块，明细交给 present 表格。
 *
 * <p>只认两种形态，避免误伤正常句子：含「名称」「数量」且带 / 或 | 的表头；连续两行以上各带 ≥2 个「·」的表体。
 *
 * <p><b>不再按「本轮有没有卡片」决定删不删</b>：没有卡片时删掉确实会丢明细，
 * 但那是调用方该补一张表（见 {@code AiActService.finishToolDone}），不该把表头漏给家人。
 */
public final class ReplyTableGuard {

  private ReplyTableGuard() {}

  /**
   * 清洗结果。
   *
   * @param text 去掉表格块后的正文；整段都是表格时为空串
   * @param stripped 是否真的删过
   */
  public record Result(String text, boolean stripped) {
    static Result keep(String text) {
      return new Result(text, false);
    }
  }

  public static Result strip(String text) {
    if (text == null || text.isBlank()) {
      return Result.keep(text == null ? "" : text);
    }
    String[] lines = text.split("\n", -1);
    int start = headerLine(lines);
    if (start < 0) {
      start = bodyBlock(lines);
    }
    if (start < 0) {
      return Result.keep(text);
    }
    int end = start;
    while (end < lines.length && (isHeader(lines[end]) || isBody(lines[end]))) {
      end++;
    }
    List<String> kept = new ArrayList<>();
    for (int i = 0; i < start; i++) {
      if (!lines[i].isBlank()) {
        kept.add(lines[i]);
      }
    }
    for (int i = end; i < lines.length; i++) {
      if (!lines[i].isBlank()) {
        kept.add(lines[i]);
      }
    }
    String out = String.join("\n", kept).trim();
    // 整段都是表格时返回空正文，由调用方补卡片或降级；不再把表格原样退回
    return new Result(out, true);
  }

  private static int headerLine(String[] lines) {
    for (int i = 0; i < lines.length; i++) {
      if (isHeader(lines[i])) {
        return i;
      }
    }
    return -1;
  }

  /** 没表头时，只有连续两行以上带「·」才算表体；单行不算，避免误伤一句话。 */
  private static int bodyBlock(String[] lines) {
    int run = 0;
    int start = -1;
    for (int i = 0; i < lines.length; i++) {
      if (isBody(lines[i])) {
        if (run == 0) {
          start = i;
        }
        run++;
        if (run >= 2) {
          return start;
        }
      } else {
        run = 0;
      }
    }
    return -1;
  }

  private static boolean isHeader(String line) {
    String s = line == null ? "" : line.trim();
    if (s.isEmpty() || !s.contains("名称") || !s.contains("数量")) {
      return false;
    }
    // 表头至少要分三列（两个分隔符）；「空间/位置」这种单个斜杠是正常中文，别当表头
    int bars = count(s, '|') + count(s, '｜');
    return bars >= 2 || count(s, '/') >= 2;
  }

  private static boolean isBody(String line) {
    String s = line == null ? "" : line.trim();
    if (s.isEmpty()) {
      return false;
    }
    return count(s, '·') + count(s, '|') + count(s, '｜') >= 2;
  }

  private static int count(String text, char ch) {
    int n = 0;
    for (int i = 0; i < text.length(); i++) {
      if (text.charAt(i) == ch) {
        n++;
      }
    }
    return n;
  }
}
