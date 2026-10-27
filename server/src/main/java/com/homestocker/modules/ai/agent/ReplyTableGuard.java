package com.homestocker.modules.ai.agent;

import java.util.ArrayList;
import java.util.List;

/**
 * 正文里手写的表格不算展示：有其他表格卡片时就删掉整块，明细交给 present 表格。
 *
 * <p>只认两种形态，避免误伤正常句子：含「名称」「数量」且带 / 或 | 的表头；连续两行以上各带 ≥2 个「·」的表体。
 *
 * <p><b>本轮没有表格卡片时不能删</b>：删完只剩「今天新增 12 样，都在厨房：」这种冒号引子，
 * 明细就彻底没了。是否删由调用方按「会不会出表格」决定。
 */
public final class ReplyTableGuard {

  private ReplyTableGuard() {}

  /**
   * 清洗结果。
   *
   * @param text 去掉表格块后的正文
   * @param stripped 是否真的删过
   */
  public record Result(String text, boolean stripped) {
    static Result keep(String text) {
      return new Result(text, false);
    }
  }

  /** 默认按「本轮有表格卡片」处理，和旧行为一致。 */
  public static Result strip(String text) {
    return strip(text, true);
  }

  /**
   * @param hasTable 本轮是否会渲染表格/图。false 时原样保留，避免把明细删成一句冒号引子。
   */
  public static Result strip(String text, boolean hasTable) {
    if (text == null || text.isBlank()) {
      return Result.keep(text == null ? "" : text);
    }
    if (!hasTable) {
      return Result.keep(text);
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
    // 保底：删干净等于把回答吞了，宁可保留原句
    if (out.isEmpty()) {
      return Result.keep(text);
    }
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
