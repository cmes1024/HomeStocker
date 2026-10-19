package com.homestocker.modules.ai.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import com.homestocker.modules.ai.infra.DeepSeekClient;
import com.homestocker.modules.ai.infra.DeepSeekClient.DeepSeekException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 编辑页「按图预填」：一次性视觉抽取。只读动作——不写台账、不产活动、不进助手历史。
 * 密钥复用 {@link ActKeyResolver}（家庭优先、hosted 池兜底），但只保留可看图预设。
 */
@Service
public class AiCaptureService {

  private static final Logger log = LoggerFactory.getLogger(AiCaptureService.class);

  /** 单次模型调用超时。最坏 2 把 key + 1 次 repair ≈ 3×12s=36s，客户端 capture 超时 60s。 */
  private static final int TIMEOUT_MS = 12_000;
  private static final int MAX_TOKENS = 800;
  private static final int MAX_HINT = 200;
  /** data URL 字符上限（base64 后约 3MB；小程序端已压到 800px/quality55）。 */
  private static final int MAX_IMAGE_CHARS = 4_000_000;
  private static final int MAX_NAME = 60;
  private static final int MAX_UNIT = 16;
  private static final int MAX_NOTE = 200;
  private static final int MIN_YEAR = 2000;
  private static final int MAX_YEARS_AHEAD = 10;
  private static final Pattern DATA_URL =
      Pattern.compile("^data:image/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\\r\\n]+)$");

  /** 输出契约：解析失败时附在 user 文本后让模型重来一次。 */
  private static final String CAPTURE_REPAIR_NOTE =
      "\n（系统：上轮输出不是合法 JSON。请只输出一个 JSON 对象，字段名与要求一致，不要 Markdown、不要解释。）";

  public static final String CAPTURE_SYSTEM_PROMPT =
      """
      你是家庭物资台账的录入助手。家人发来一张物资照片（一次录入可能有多张，如正面、背面、标签），「当前表单」里可能已有来自之前照片或人工填写的值。请对比照片与当前表单，只依据照片里看得见的内容，输出合并后的最终字段。
      只输出一个 JSON 对象，字段如下（没有看到就输出空字符串，禁止猜测、禁止编造、禁止补全常识）：
      - name：物资名称，取包装上的商品名，去掉广告词和卖点描述；看不清留空
      - quantity：数量，只写阿拉伯数字，如 2、0.5；瓶装袋装按件计写 1；看不清留空
      - unit：与数量对应的量词，如 瓶、盒、袋、桶、个、提；没有留空
      - note：照片上可见的关键信息，如「促销装」「临期」；没有留空
      - productionDate：生产日期，格式 YYYY-MM-DD；照片没写留空
      - expireDate：保质期到期日，格式 YYYY-MM-DD；照片没写留空
      裁决规则：
      - 照片上有明确可读的值 → 以照片为准输出（可修正表单里的旧值）
      - 照片没显示或看不清 → 原样保留当前表单里的值，不要输出空
      - 照片与表单冲突且照片信息更完整（如带上规格、单位）→ 以照片为准
      - 表单为空且照片也没有 → 输出空字符串
      规则：「2026年12月1日」要换算成 2026-12-01；只认印刷或标签上的字，不认手写涂改；整段 JSON 之外不要任何文字。""";

  private final ActKeyResolver actKeyResolver;
  private final DeepSeekClient deepSeekClient;
  private final AiRateLimitService rateLimitService;
  private final PlatformKeyCooldown platformKeyCooldown;
  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final ObjectMapper objectMapper;

  public AiCaptureService(
      ActKeyResolver actKeyResolver,
      DeepSeekClient deepSeekClient,
      AiRateLimitService rateLimitService,
      PlatformKeyCooldown platformKeyCooldown,
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      ObjectMapper objectMapper) {
    this.actKeyResolver = actKeyResolver;
    this.deepSeekClient = deepSeekClient;
    this.rateLimitService = rateLimitService;
    this.platformKeyCooldown = platformKeyCooldown;
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.objectMapper = objectMapper;
  }

  private record Ctx(String openid, String familyId) {}

  private Ctx requireFamily() {
    String openid = RequestContext.require().openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null
        || familyId.isBlank()
        || !membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return new Ctx(openid, familyId);
  }

  public Map<String, Object> capture(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    rateLimitService.checkAct(ctx.openid());

    String dataUrl = normalizeDataUrl(body == null ? null : str(body.get("image")));
    if (dataUrl.isEmpty()) {
      throw ApiException.of(ErrorCodes.BAD_REQUEST, "图片为空或格式不支持");
    }
    String hint = str(body == null ? null : body.get("hint")).trim();
    if (hint.length() > MAX_HINT) {
      hint = hint.substring(0, MAX_HINT);
    }

    // 当前表单快照：让模型对比照片与已填值定夺每个字段，而不是对着一张图盲猜
    Map<String, Object> context =
        normalizeContext(objectMapper, body == null ? null : body.get("context"));

    List<KeyRow> keys = visionKeys(actKeyResolver.select(ctx.familyId()));
    if (keys.isEmpty()) {
      throw ApiException.of(
          ErrorCodes.NO_VISION_KEY, "当前家庭没有可识别图片的模型，请到 AI 配置页添加可看图模型的密钥");
    }

    DeepSeekClient.ChatResult result = null;
    String lastCode = ErrorCodes.ACT_FAILED;
    boolean sawQuota = false;
    int lastStatus = 0;
    String lastMessage = "";
    KeyRow used = null;
    for (KeyRow key : keys) {
      try {
        result =
            deepSeekClient.complete(
                key.apiKey(),
                key.baseUrl(),
                ModelCatalog.callModel(key.provider(), key.model()),
                buildMessages(objectMapper, hint, context, dataUrl, false),
                null,
                TIMEOUT_MS,
                MAX_TOKENS);
        used = key;
        break;
      } catch (DeepSeekException e) {
        lastCode = e.code();
        lastMessage = e.getMessage();
        lastStatus = e.httpStatus();
        if (ErrorCodes.AI_QUOTA.equals(e.code())) {
          sawQuota = true;
        }
        boolean switchKey = PlatformKeyFailover.switches(e.code(), e.retryable(), isHostedKey(key));
        if (isHostedKey(key) && switchKey) {
          platformKeyCooldown.cool(key.id(), System.currentTimeMillis());
        }
        if (!switchKey) {
          break;
        }
      }
    }
    if (result == null) {
      throw ApiException.of(
          lastCode, friendlyFailure(isHostedSelection(keys), sawQuota, lastStatus, lastMessage));
    }

    Map<String, Object> fields;
    try {
      fields = parseFields(objectMapper, result.content());
    } catch (IllegalArgumentException badJson) {
      // 一次 repair：同密钥重发，user 文本附修复说明
      try {
        DeepSeekClient.ChatResult retry =
            deepSeekClient.complete(
                used.apiKey(),
                used.baseUrl(),
                ModelCatalog.callModel(used.provider(), used.model()),
                buildMessages(objectMapper, hint, context, dataUrl, true),
                null,
                TIMEOUT_MS,
                MAX_TOKENS);
        fields = parseFields(objectMapper, retry.content());
      } catch (DeepSeekException | IllegalArgumentException retryFail) {
        log.info("[ai.capture] repair failed: {}", retryFail.getMessage());
        throw ApiException.of(ErrorCodes.ACT_FAILED, "没认出这张图里的物资，请手动填写");
      }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("fields", fields);
    Map<String, Object> modelUsed = new LinkedHashMap<>();
    modelUsed.put("provider", ModelCatalog.providerLabel(used.provider()));
    modelUsed.put("model", ModelCatalog.callModel(used.provider(), used.model()));
    out.put("modelUsed", modelUsed);
    return out;
  }

  private static boolean isHostedKey(KeyRow key) {
    return key.familyId() == null || key.familyId().isBlank();
  }

  private static boolean isHostedSelection(List<KeyRow> keys) {
    return !keys.isEmpty() && isHostedKey(keys.get(0));
  }

  private static String friendlyFailure(
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

  /** 只留可看图密钥，最多两把（与 hosted 池切换次数一致）。家庭视觉密钥优先（排他），家庭没有才兜底 hosted 池。 */
  static List<KeyRow> visionKeys(ActKeyResolver.Selection selection) {
    List<KeyRow> out = new ArrayList<>();
    if (selection == null || selection.keys() == null) {
      return out;
    }
    for (KeyRow key : selection.keys()) {
      if (!isHostedKey(key) && ModelCatalog.isVision(key.provider(), key.model())) {
        out.add(key);
      }
    }
    if (out.isEmpty()) {
      for (KeyRow key : selection.keys()) {
        if (isHostedKey(key) && ModelCatalog.isVision(key.provider(), key.model())) {
          out.add(key);
        }
      }
    }
    if (out.size() > PlatformKeyFailover.MAX_ATTEMPTS) {
      return new ArrayList<>(out.subList(0, PlatformKeyFailover.MAX_ATTEMPTS));
    }
    return out;
  }

  static ArrayNode buildMessages(
      ObjectMapper om,
      String hint,
      Map<String, Object> context,
      String dataUrl,
      boolean repair) {
    ArrayNode messages = om.createArrayNode();
    messages.addObject().put("role", "system").put("content", CAPTURE_SYSTEM_PROMPT);
    ObjectNode user = messages.addObject();
    user.put("role", "user");
    ArrayNode parts = user.putArray("content");
    ObjectNode textPart = parts.addObject();
    textPart.put("type", "text");
    String text =
        (hint == null || hint.isBlank() ? "请抽取这张照片里物资的字段。" : hint.trim())
            + contextLine(context)
            + (repair ? CAPTURE_REPAIR_NOTE : "");
    textPart.put("text", text);
    ObjectNode imagePart = parts.addObject();
    imagePart.put("type", "image_url");
    imagePart.putObject("image_url").put("url", dataUrl);
    return messages;
  }

  /** 归一化 data URL：限 image mime、去空白、限长；非 base64 data URL 一律拒绝。 */
  static String normalizeDataUrl(String raw) {
    if (raw == null) {
      return "";
    }
    String trimmed = raw.trim();
    if (trimmed.length() > MAX_IMAGE_CHARS) {
      return "";
    }
    Matcher m = DATA_URL.matcher(trimmed);
    if (!m.matches()) {
      return "";
    }
    String base64 = m.group(2).replaceAll("\\s", "");
    if (base64.isEmpty()) {
      return "";
    }
    return "data:image/" + ("jpg".equals(m.group(1)) ? "jpeg" : m.group(1)) + ";base64," + base64;
  }

  /**
   * 归一化「当前表单」上下文：只留 6 个契约字段，规则与 parseFields 一致（限长、数量非负整数、
   * 日期 YYYY-MM-DD 且在 2000..+10 年）。空值/非法值不带入，避免把噪声当事实喂给模型。
   */
  static Map<String, Object> normalizeContext(ObjectMapper om, Object raw) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (!(raw instanceof Map)) {
      return out;
    }
    JsonNode node = om.valueToTree(raw);
    if (node == null || !node.isObject()) {
      return out;
    }
    putText(out, node, "name", MAX_NAME);
    putQuantity(out, node, "quantity");
    putText(out, node, "unit", MAX_UNIT);
    putText(out, node, "note", MAX_NOTE);
    putDate(out, node, "productionDate");
    putDate(out, node, "expireDate");
    return out;
  }

  /** 上下文行：拼在 user 文本后供模型对比；空表单不带该行（此时等价于纯抽取）。 */
  static String contextLine(Map<String, Object> context) {
    if (context == null || context.isEmpty()) {
      return "";
    }
    return "\n当前表单（空字符串表示未填）："
        + "name「" + context.getOrDefault("name", "") + "」"
        + " | quantity " + context.getOrDefault("quantity", "")
        + " | unit「" + context.getOrDefault("unit", "") + "」"
        + " | note「" + context.getOrDefault("note", "") + "」"
        + " | productionDate「" + context.getOrDefault("productionDate", "") + "」"
        + " | expireDate「" + context.getOrDefault("expireDate", "") + "」";
  }

  /**
   * 解析模型输出为字段建议。非法 JSON 抛 IllegalArgumentException；字段逐个归一化，
   * 非法值丢弃（数量非有限非负数、日期非法或超范围、超长文本）。
   */
  static Map<String, Object> parseFields(ObjectMapper om, String content) {
    String json = stripFence(content);
    JsonNode root;
    try {
      root = om.readTree(json == null ? "" : json);
    } catch (Exception e) {
      throw new IllegalArgumentException("not json");
    }
    if (root == null || !root.isObject()) {
      throw new IllegalArgumentException("not object");
    }
    Map<String, Object> out = new LinkedHashMap<>();
    putText(out, root, "name", MAX_NAME);
    putQuantity(out, root, "quantity");
    putText(out, root, "unit", MAX_UNIT);
    putText(out, root, "note", MAX_NOTE);
    putDate(out, root, "productionDate");
    putDate(out, root, "expireDate");
    return out;
  }

  private static String stripFence(String content) {
    if (content == null) {
      return "";
    }
    String s = content.trim();
    if (s.startsWith("```")) {
      int first = s.indexOf('\n');
      int last = s.lastIndexOf("```");
      if (first >= 0 && last > first) {
        return s.substring(first + 1, last).trim();
      }
    }
    return s;
  }

  private static void putText(Map<String, Object> out, JsonNode root, String key, int maxLen) {
    JsonNode node = root.get(key);
    if (node == null || node.isNull()) {
      return;
    }
    String value = node.isTextual() ? node.asText().trim() : node.asText("").trim();
    if (!value.isEmpty()) {
      out.put(key, value.length() > maxLen ? value.substring(0, maxLen) : value);
    }
  }

  private static void putQuantity(Map<String, Object> out, JsonNode root, String key) {
    JsonNode node = root.get(key);
    if (node == null || node.isNull()) {
      return;
    }
    String raw = node.isNumber() ? node.asText() : (node.isTextual() ? node.asText().trim() : "");
    if (raw.isEmpty()) {
      return;
    }
    try {
      double d = Double.parseDouble(raw);
      if (!Double.isFinite(d) || d < 0) {
        return;
      }
      // 数量允许小数（items.quantity 是 NUMERIC，提示词也允许 0.5）：统一保留两位，
      // 整数仍回 long，避免编辑页输入框出现 3.0。
      double rounded = Math.round(d * 100) / 100.0;
      if (rounded == Math.rint(rounded) && rounded <= (double) Long.MAX_VALUE) {
        out.put(key, (long) rounded);
      } else {
        out.put(key, rounded);
      }
    } catch (NumberFormatException e) {
      // 丢字段，不丢整单
    }
  }

  private static void putDate(Map<String, Object> out, JsonNode root, String key) {
    JsonNode node = root.get(key);
    if (node == null || node.isNull() || !node.isTextual()) {
      return;
    }
    String value = node.asText().trim();
    if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) {
      return;
    }
    try {
      LocalDate date = LocalDate.parse(value);
      LocalDate floor = LocalDate.of(MIN_YEAR, 1, 1);
      LocalDate ceil = LocalDate.now().plusYears(MAX_YEARS_AHEAD);
      if (date.isBefore(floor) || date.isAfter(ceil)) {
        return;
      }
      out.put(key, value);
    } catch (DateTimeParseException e) {
      // 丢字段，不丢整单
    }
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }
}
