package com.homestocker.modules.voice.app;

/**
 * 交给合成器之前，把阿拉伯数字改成中文读法。
 *
 * <p>只处理孤立的「2」。合成器见到「2桶」一律念 èr tǒng，可中文里数数量说「两桶」，
 * 只有日子和编号才说「二」——「2月」「2号楼」「第2名」。其余数字（3桶、12桶）本来就念得对，
 * 不动它们，免得把「2.5」「2026」「2:30」这类多位数拆坏。
 */
final class SpokenNumbers {

  private SpokenNumbers() {}

  /** 这些字跟着的 2 读「二」：日期、门牌、序号，不是数量。 */
  private static final String ORDINAL_HEADS = "月号日楼层路线点届期班区段";

  /** 「有，油2桶，在仓库。」→「有，油两桶，在仓库。」 */
  static String speak(String text) {
    if (text == null || text.isEmpty()) {
      return "";
    }
    StringBuilder out = new StringBuilder(text.length() + 4);
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      String spoken = c == '2' && alone(text, i) ? says(text, i) : null;
      if (spoken != null) {
        out.append(spoken);
      } else {
        out.append(c);
      }
    }
    return out.toString();
  }

  /** 前后都不是数字才算「一个 2」，避免把 12、2.5、2026 拆开。 */
  private static boolean alone(String s, int i) {
    if (i > 0 && Character.isDigit(s.charAt(i - 1))) {
      return false;
    }
    return i + 1 >= s.length() || !Character.isDigit(s.charAt(i + 1));
  }

  /** 返回 null 表示按原样交给合成器。 */
  private static String says(String s, int i) {
    boolean afterDi = i > 0 && s.charAt(i - 1) == '第';
    if (i + 1 >= s.length()) {
      return afterDi ? "二" : null;
    }
    char next = s.charAt(i + 1);
    if (!isHan(next)) {
      return null;
    }
    if (afterDi) {
      return "二";
    }
    if (next == '两') {
      return "二";
    }
    if (ORDINAL_HEADS.indexOf(next) >= 0) {
      return "二";
    }
    return "两";
  }

  private static boolean isHan(char c) {
    return Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN;
  }
}
