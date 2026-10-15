package com.homestocker.modules.ai.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.modules.ai.app.AiKeyService;
import com.homestocker.modules.ai.app.AssistPromptTexts;
import com.homestocker.modules.ai.app.ModelCatalog;
import com.homestocker.modules.ai.app.PlatformKeyCooldown;
import com.homestocker.modules.ai.app.PlatformKeyFailover;
import com.homestocker.modules.ai.infra.DeepSeekClient;
import com.homestocker.modules.ai.infra.DeepSeekClient.DeepSeekException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Port of agent/model.js (prompt fill, history, askModel). */
@Component
public class ActPrompt {

  private static final Logger log = LoggerFactory.getLogger(ActPrompt.class);
  private static final int HISTORY_LIMIT = 20;
  private static final int HISTORY_TEXT_MAX = 800;
  /** 相邻发言超过此时长，视为上一场，仍保留原文，只在中间插入时间间隔。 */
  static final long SESSION_GAP_MS = 60L * 60L * 1000L;

  private final DeepSeekClient deepSeekClient;
  private final ObjectMapper objectMapper;
  private final PlatformKeyCooldown platformKeyCooldown;

  public ActPrompt(
      DeepSeekClient deepSeekClient,
      ObjectMapper objectMapper,
      PlatformKeyCooldown platformKeyCooldown) {
    this.deepSeekClient = deepSeekClient;
    this.objectMapper = objectMapper;
    this.platformKeyCooldown = platformKeyCooldown;
  }

  public record AskResult(PlanParser.ActPlan plan, Map<String, String> turn) {}

  public record ModelOpts(
      List<AiKeyService.KeyRow> keys,
      int timeoutMs,
      int maxTokens,
      List<Map<String, String>> history,
      boolean hostedPool) {}

  public static boolean isQtyReceiptText(String text) {
    String t = str(text);
    return t.contains("已改") && t.contains("→");
  }

  public static List<Map<String, String>> sanitizeHistory(Object raw) {
    if (!(raw instanceof List<?> list)) {
      return List.of();
    }
    List<Map<String, String>> out = new ArrayList<>();
    for (Object o : list) {
      if (!(o instanceof Map<?, ?> row)) {
        continue;
      }
      String role =
          "assistant".equals(String.valueOf(row.get("role")))
              ? "assistant"
              : "user".equals(String.valueOf(row.get("role"))) ? "user" : "";
      if (role.isEmpty()) {
        continue;
      }
      String text = str(row.get("text"));
      if (text.isEmpty()) {
        text = str(row.get("content"));
      }
      text = text.trim();
      if (text.length() > HISTORY_TEXT_MAX) {
        text = text.substring(0, HISTORY_TEXT_MAX);
      }
      if (text.isEmpty()) {
        continue;
      }
      Map<String, String> turn = new LinkedHashMap<>();
      turn.put("role", role);
      turn.put("text", text);
      String at = normalizeAt(row.get("at"));
      if (!at.isEmpty()) {
        turn.put("at", at);
      }
      out.add(turn);
    }
    return truncatePreferReceipts(out, HISTORY_LIMIT);
  }

  /**
   * 送模型的消息。间隔超过 {@link #SESSION_GAP_MS} 时插入一条 system 事实，上一场原文仍保留。
   * 家人这次若接着上一场说，模型还能看见；没接着，则不要把上方当成刚刚发生。
   */
  static List<Map<String, String>> historyForModel(List<Map<String, String>> history, long nowMs) {
    List<Map<String, String>> out = new ArrayList<>();
    Long prevAt = null;
    for (Map<String, String> row : history != null ? history : List.<Map<String, String>>of()) {
      if (row == null) {
        continue;
      }
      Long at = parseAtMs(row.get("at"));
      if (prevAt != null && at != null && at - prevAt > SESSION_GAP_MS) {
        out.add(gapNote(prevAt));
      }
      out.add(row);
      if (at != null) {
        prevAt = at;
      }
    }
    if (prevAt != null && nowMs - prevAt > SESSION_GAP_MS) {
      out.add(gapNote(prevAt));
    }
    return out;
  }

  private static Map<String, String> gapNote(long previousAtMs) {
    String when = ShanghaiDates.formatDateTimeMs(previousAtMs);
    String text =
        when.isEmpty()
            ? "时间间隔：此条之前的对话距下一条已超过 1 小时。上方内容不是刚刚发生的；家人这次若接着上一场说，仍以那些内容为准。"
            : "时间间隔：此条之前的对话结束于 "
                + when
                + "，距下一条已超过 1 小时。上方内容不是刚刚发生的；家人这次若接着上一场说，仍以那些内容为准。";
    Map<String, String> note = new LinkedHashMap<>();
    note.put("role", "system");
    note.put("text", text);
    return note;
  }

  private static Long parseAtMs(String at) {
    if (at == null || at.isBlank()) {
      return null;
    }
    try {
      long ms = Long.parseLong(at.trim());
      return ms > 0 ? ms : null;
    } catch (NumberFormatException e) {
      return null;
    }
  }

  /** 保留合法 epoch ms 字符串，供模型侧打时间前缀；非法则丢弃 */
  static String normalizeAt(Object raw) {
    if (raw == null) {
      return "";
    }
    String s = String.valueOf(raw).trim();
    if (s.isEmpty()) {
      return "";
    }
    try {
      long ms = Long.parseLong(s);
      return ms > 0 ? Long.toString(ms) : "";
    } catch (NumberFormatException e) {
      return "";
    }
  }

  /** 送模型时的正文：可选句末（消息时间 …）；落盘 text 保持干净 */
  public static String historyContentForModel(Map<String, String> row) {
    if (row == null) {
      return "";
    }
    return ShanghaiDates.stampContent(str(row.get("text")), str(row.get("at")));
  }

  public static List<Map<String, String>> truncatePreferReceipts(
      List<Map<String, String>> rows, int limit) {
    if (rows.size() <= limit) {
      return rows;
    }
    Set<Integer> keep = new LinkedHashSet<>();
    for (int i = rows.size() - 1; i >= 0; i--) {
      Map<String, String> row = rows.get(i);
      if ("assistant".equals(row.get("role")) && isQtyReceiptText(row.get("text"))) {
        keep.add(i);
        if (keep.size() >= limit) {
          break;
        }
      }
    }
    for (int i = rows.size() - 1; i >= 0 && keep.size() < limit; i--) {
      keep.add(i);
    }
    List<Map<String, String>> out = new ArrayList<>();
    for (int i = 0; i < rows.size(); i++) {
      if (keep.contains(i)) {
        out.add(rows.get(i));
      }
    }
    return out;
  }

  public static String renderHistory(List<Map<String, String>> rows) {
    if (rows == null || rows.isEmpty()) {
      return "无";
    }
    StringBuilder sb = new StringBuilder();
    for (Map<String, String> row : rows) {
      if (sb.length() > 0) {
        sb.append('\n');
      }
      sb.append("assistant".equals(row.get("role")) ? "助手" : "家人")
          .append("：")
          .append(historyContentForModel(row));
    }
    return sb.toString();
  }

  public static String renderProbeRows(List<Map<String, Object>> rows) {
    if (rows == null || rows.isEmpty()) {
      return "无";
    }
    StringBuilder sb = new StringBuilder();
    for (Map<String, Object> row : rows) {
      if (sb.length() > 0) {
        sb.append('\n');
      }
      sb.append(ActRefs.renderFocus(row));
    }
    return sb.toString();
  }

  public static String fillAssistPrompt(String system, Map<String, String> vars) {
    String s = str(system);
    return s.replace("{{TODAY}}", vars.getOrDefault("today", ""))
        .replace("{{WEEKDAY}}", vars.getOrDefault("weekday", ""))
        .replace("{{FAMILY_NAME}}", vars.getOrDefault("familyName", "家庭"))
        .replace("{{MEMBER_COUNT}}", vars.getOrDefault("memberCount", "0"))
        .replace("{{CAPABILITIES}}", vars.getOrDefault("capabilities", ""))
        .replace("{{TREE}}", vars.getOrDefault("tree", ""))
        .replace("{{FOCUS}}", vars.getOrDefault("focus", "无"))
        .replace("{{PROBE}}", vars.getOrDefault("probe", "无"))
        .replace("{{SNAPSHOT}}", vars.getOrDefault("snapshot", "无"))
        .replace("{{HISTORY}}", vars.getOrDefault("history", "无"))
        .replace("{{EXEC}}", vars.getOrDefault("exec", "无"))
        .replace("{{KNOWLEDGE_INDEX}}", vars.getOrDefault("knowledgeIndex", "无"))
        .replace("{{KNOWLEDGE}}", vars.getOrDefault("knowledge", "无"))
        .replace("{{HABITS}}", vars.getOrDefault("habits", "无"));
  }

  public static String renderExecReceipt(Map<String, Object> report, String treeText) {
    List<String> lines = new ArrayList<>();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> executed =
        report.get("executed") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> failed =
        report.get("failed") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> pending =
        report.get("pending") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    if (!executed.isEmpty()) {
      lines.add("已成功：");
      for (Map<String, Object> row : executed) {
        lines.add(
            "- 第 "
                + row.get("step")
                + " 步 "
                + row.get("use")
                + "："
                + (row.get("summary") != null ? row.get("summary") : "完成"));
      }
    } else {
      lines.add("已成功：无");
    }
    if (!failed.isEmpty()) {
      lines.add("已失败：");
      for (Map<String, Object> row : failed) {
        lines.add(
            "- 第 "
                + row.get("step")
                + " 步 "
                + row.get("use")
                + "："
                + (row.get("summary") != null ? row.get("summary") : "失败"));
        if (row.get("call") != null) {
          lines.add("  原调用：" + row.get("call"));
        }
      }
    } else {
      lines.add("已失败：无");
    }
    if (!pending.isEmpty()) {
      lines.add("尚未执行（请重编排；勿重复已成功步骤）：");
      for (Map<String, Object> call : pending) {
        lines.add("- " + call);
      }
    } else {
      lines.add("尚未执行：无");
    }
    lines.add("当前家庭结构：");
    lines.add(treeText != null ? treeText : "无");
    return String.join("\n", lines);
  }

  private static final String JSON_REPAIR_NOTE =
      "（系统：上轮输出不是合法 JSON 计划，已丢弃。请只输出一个 JSON 对象；禁止口头句与时间戳标记。）";
  private static final String JSON_EMPTY_NOTE =
      "（系统：上轮输出为空。请只输出一个 JSON 对象计划。）";

  public AskResult askModel(ModelOpts opts, String system, String userText) throws ActModelException {
    List<AiKeyService.KeyRow> tryKeys =
        opts.keys().size() > 2 ? opts.keys().subList(0, 2) : opts.keys();
    if (opts.hostedPool() && tryKeys.isEmpty()) {
      throw new ActModelException(ErrorCodes.ACT_FAILED, PlatformKeyFailover.UNAVAILABLE);
    }
    String lastCode = ErrorCodes.ACT_FAILED;
    String lastMessage = PlatformKeyFailover.UNAVAILABLE;
    int lastStatus = 0;
    boolean sawQuota = false;
    String lastContent = "";
    log.info("[ai.act] >>> system\n{}", system);
    log.info("[ai.act] >>> user\n{}", userText);
    for (AiKeyService.KeyRow key : tryKeys) {
      try {
        String model = ModelCatalog.callModel(key.provider(), key.model());
        DeepSeekClient.ChatResult result =
            deepSeekClient.chatCompletions(
                key.apiKey(),
                key.baseUrl(),
                model,
                system,
                userText,
                historyForModel(opts.history(), System.currentTimeMillis()),
                opts.timeoutMs(),
                opts.maxTokens(),
                ModelCatalog.jsonObjectFor(key.provider(), model));
        lastContent = result.content();
        log.info("[ai.act] <<< model\n{}", lastContent);
        return acceptOrRepairPlan(opts, key, system, userText, lastContent);
      } catch (DeepSeekException e) {
        lastCode = e.code();
        lastMessage = e.getMessage();
        lastStatus = e.httpStatus();
        if (ErrorCodes.AI_QUOTA.equals(e.code())) {
          sawQuota = true;
        }
        boolean switchKey = PlatformKeyFailover.switches(e.code(), e.retryable(), opts.hostedPool());
        if (opts.hostedPool() && switchKey) {
          platformKeyCooldown.cool(key.id(), System.currentTimeMillis());
        }
        if (!switchKey) {
          throw new ActModelException(
              lastCode, terminalFailureMessage(opts.hostedPool(), sawQuota, lastStatus, lastMessage));
        }
      }
    }
    if (!opts.hostedPool() && !lastContent.isEmpty()) {
      AskResult recovered = recoverFromBadPlan(system, userText, lastContent);
      if (recovered != null) {
        return recovered;
      }
      return degradeAskResult(system, userText, lastContent);
    }
    throw new ActModelException(
        opts.hostedPool() ? ErrorCodes.ACT_FAILED : lastCode,
        terminalFailureMessage(opts.hostedPool(), sawQuota, lastStatus, lastMessage));
  }

  public static String terminalFailureMessage(
      boolean hostedPool, boolean sawQuota, int lastStatus, String lastMessage) {
    if (hostedPool) {
      return PlatformKeyFailover.UNAVAILABLE;
    }
    if (sawQuota) {
      return "家庭 AI 额度可能已用完，请检查密钥余额或更换密钥";
    }
    if (lastStatus == 401) {
      return "密钥无效，请到 AI 配置页检查";
    }
    return lastMessage == null || lastMessage.isBlank()
        ? PlatformKeyFailover.UNAVAILABLE
        : lastMessage;
  }

  private AskResult acceptOrRepairPlan(
      ModelOpts opts,
      AiKeyService.KeyRow key,
      String system,
      String userText,
      String content)
      throws DeepSeekException {
    try {
      return okPlan(system, userText, content);
    } catch (IllegalArgumentException badPlan) {
      String trimmed = content == null ? "" : content.trim();
      log.warn(
          "[ai.act] invalid plan json, retry once. content={}",
          trimmed.length() > 200 ? trimmed.substring(0, 200) : trimmed);
      String repairUser =
          userText
              + "\n"
              + (trimmed.isEmpty() ? JSON_EMPTY_NOTE : JSON_REPAIR_NOTE);
      String model = ModelCatalog.callModel(key.provider(), key.model());
      DeepSeekClient.ChatResult retry =
          deepSeekClient.chatCompletions(
              key.apiKey(),
              key.baseUrl(),
              model,
              system,
              repairUser,
              historyForModel(opts.history(), System.currentTimeMillis()),
              opts.timeoutMs(),
              opts.maxTokens(),
              ModelCatalog.jsonObjectFor(key.provider(), model));
      String retryContent = retry.content();
      log.info("[ai.act] <<< model (json repair)\n{}", retryContent);
      try {
        return okPlan(system, repairUser, retryContent);
      } catch (IllegalArgumentException stillBad) {
        AskResult recovered = recoverFromBadPlan(system, userText, retryContent);
        if (recovered != null) {
          return recovered;
        }
        recovered = recoverFromBadPlan(system, userText, content);
        if (recovered != null) {
          return recovered;
        }
        log.warn(
            "[ai.act] invalid plan json after repair, degrade ask. content={}",
            retryContent == null ? "" : retryContent.trim());
        return degradeAskResult(system, userText, retryContent);
      }
    }
  }

  private AskResult okPlan(String system, String userText, String content) {
    PlanParser.ActPlan plan = PlanParser.parsePlan(content, objectMapper);
    Map<String, String> turn = new LinkedHashMap<>();
    turn.put("system", system != null ? system : "");
    turn.put("user", userText != null ? userText : "");
    turn.put("model", content != null ? content : "");
    return new AskResult(plan, turn);
  }

  /** 把非 JSON 口头句收成 reply；疑似伪写回执则放弃。 */
  private AskResult recoverFromBadPlan(String system, String userText, String content) {
    PlanParser.ActPlan loose = PlanParser.coercePlainTextPlan(content);
    if (loose == null) {
      return null;
    }
    log.warn(
        "[ai.act] coerced plain text to reply. content={}",
        content == null ? "" : content.trim());
    Map<String, String> turn = new LinkedHashMap<>();
    turn.put("system", system != null ? system : "");
    turn.put("user", userText != null ? userText : "");
    turn.put("model", content != null ? content : "");
    return new AskResult(loose, turn);
  }

  private static AskResult degradeAskResult(String system, String userText, String modelRaw) {
    Map<String, Object> ask = new LinkedHashMap<>();
    ask.put("question", AssistPromptTexts.DEGRADE_ASK);
    ask.put("options", List.of());
    PlanParser.ActPlan plan = new PlanParser.ActPlan(List.of(ask), null, List.of(), "", null);
    Map<String, String> turn = new LinkedHashMap<>();
    turn.put("system", system != null ? system : "");
    turn.put("user", userText != null ? userText : "");
    turn.put("model", modelRaw != null ? modelRaw : "");
    return new AskResult(plan, turn);
  }

  public static class ActModelException extends Exception {
    private final String code;

    public ActModelException(String code, String message) {
      super(message);
      this.code = code;
    }

    public String code() {
      return code;
    }
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
