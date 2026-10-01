package com.homestocker.modules.ai.pages;

import com.homestocker.modules.ai.agent.ActRefs;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Port of pages/index.js */
public final class PageRegistry {

  public static final int MAX_GETS_PER_ACT = 3;

  private static final Map<String, String> PAGE_ALIASES = Map.of("family.keys", "ai.keys");

  private static final List<Map<String, Object>> PAGES = buildPages();
  private static final Map<String, Map<String, Object>> BY_ID = indexById();

  private PageRegistry() {}

  public static List<Map<String, Object>> listEnabled() {
    return PAGES;
  }

  public static Map<String, Object> getPage(String pageId) {
    String id = resolvePageId(pageId);
    if (id.isEmpty()) {
      return null;
    }
    return BY_ID.get(id);
  }

  public static String resolvePageId(String pageId) {
    String id = pageId == null ? "" : pageId.trim();
    if (id.isEmpty()) {
      return "";
    }
    return PAGE_ALIASES.getOrDefault(id, id);
  }

  public static String renderIndex() {
    List<String> lines = new ArrayList<>();
    for (Map<String, Object> p : PAGES) {
      lines.add("- " + p.get("pageId") + "：" + p.get("hint"));
    }
    return lines.isEmpty() ? "无" : String.join("\n", lines);
  }

  public static String renderPageContract(Map<String, Object> page) {
    if (page == null) {
      return "";
    }
    @SuppressWarnings("unchecked")
    List<String> req = (List<String>) page.getOrDefault("required", List.of());
    @SuppressWarnings("unchecked")
    List<String> opt = (List<String>) page.getOrDefault("optional", List.of());
    String reqLine = req.isEmpty() ? "必填 query：无" : "必填 query：" + String.join(", ", req);
    String optLine = opt.isEmpty() ? "可选 query：无" : "可选 query：" + String.join(", ", opt);
    String refHint = Boolean.TRUE.equals(page.get("allowRefAsId")) ? "物资页可用本轮短号 ref（F*/P*）代替 id。" : "";
    return String.join(
        "\n",
        List.of(
            "pageId：" + page.get("pageId"),
            "path：" + page.get("path"),
            "用途：" + page.get("hint"),
            reqLine,
            optLine,
            refHint))
        .replace("\n\n", "\n");
  }

  public static ResolveResult resolveQuery(
      Map<String, Object> page, Map<String, Object> rawQuery, Map<String, Map<String, Object>> refs) {
    Map<String, String> query = normalizeQuery(rawQuery);
    if (Boolean.TRUE.equals(page.get("allowRefAsId"))) {
      String refRaw = query.getOrDefault("ref", "").trim();
      if (!refRaw.isEmpty() && !query.containsKey("id")) {
        Map<String, Object> row = ActRefs.lookupRef(Map.of("ref", refRaw), refs);
        if (row == null || String.valueOf(row.get("itemId")).isBlank()) {
          return ResolveResult.fail(
              "短号 "
                  + refRaw.toUpperCase()
                  + " 本轮无效，请先 probe/search 或带详情关注");
        }
        query.put("id", String.valueOf(row.get("itemId")));
      }
      query.remove("ref");
    } else {
      query.remove("ref");
    }
    @SuppressWarnings("unchecked")
    List<String> required = (List<String>) page.getOrDefault("required", List.of());
    @SuppressWarnings("unchecked")
    List<String> optional = (List<String>) page.getOrDefault("optional", List.of());
    java.util.Set<String> allowed = new java.util.LinkedHashSet<>();
    allowed.addAll(required);
    allowed.addAll(optional);
    List<String> unknown = query.keySet().stream().filter(k -> !allowed.contains(k)).toList();
    if (!unknown.isEmpty()) {
      return ResolveResult.fail("不支持的参数：" + String.join(", ", unknown));
    }
    for (String k : required) {
      if (!query.containsKey(k) || query.get(k).isBlank()) {
        return ResolveResult.fail("缺少必填参数 " + k);
      }
    }
    return ResolveResult.ok(query);
  }

  public static NavResult buildNavUrl(
      String pageId, Map<String, Object> rawQuery, Map<String, Map<String, Object>> refs) {
    Map<String, Object> page = getPage(pageId);
    if (page == null) {
      return NavResult.fail("没有「" + pageId + "」这个页面");
    }
    ResolveResult resolved = resolveQuery(page, rawQuery, refs);
    if (!resolved.ok()) {
      return NavResult.fail(resolved.error());
    }
    Map<String, String> q = resolved.query();
    List<String> parts = new ArrayList<>();
    for (Map.Entry<String, String> e : q.entrySet()) {
      parts.add(
          URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8)
              + "="
              + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8));
    }
    String url =
        parts.isEmpty()
            ? String.valueOf(page.get("path"))
            : page.get("path") + "?" + String.join("&", parts);
    return NavResult.ok(
        url,
        String.valueOf(page.get("label")),
        String.valueOf(page.get("pageId")),
        String.valueOf(page.get("path")));
  }

  public record ResolveResult(boolean ok, Map<String, String> query, String error) {
    static ResolveResult ok(Map<String, String> query) {
      return new ResolveResult(true, query, null);
    }

    static ResolveResult fail(String error) {
      return new ResolveResult(false, Map.of(), error);
    }
  }

  public record NavResult(
      boolean ok, String url, String label, String pageId, String path, String error) {
    static NavResult ok(String url, String label, String pageId, String path) {
      return new NavResult(true, url, label, pageId, path, null);
    }

    static NavResult fail(String error) {
      return new NavResult(false, null, null, null, null, error);
    }
  }

  private static Map<String, String> normalizeQuery(Map<String, Object> raw) {
    Map<String, String> out = new LinkedHashMap<>();
    if (raw == null) {
      return out;
    }
    for (Map.Entry<String, Object> e : raw.entrySet()) {
      String key = e.getKey() == null ? "" : e.getKey().trim();
      if (key.isEmpty() || e.getValue() == null || "".equals(e.getValue())) {
        continue;
      }
      out.put(key, String.valueOf(e.getValue()).trim());
    }
    return out;
  }

  private static Map<String, Map<String, Object>> indexById() {
    Map<String, Map<String, Object>> map = new LinkedHashMap<>();
    for (Map<String, Object> p : PAGES) {
      map.put(String.valueOf(p.get("pageId")), p);
    }
    return map;
  }

  private static List<Map<String, Object>> buildPages() {
    List<Map<String, Object>> pages = new ArrayList<>();
    pages.add(page("items.list", "/pages/items/index", "全家物资清单首页", List.of(), List.of(), "打开清单", false));
    pages.add(
        page(
            "items.edit",
            "/pages/items/edit",
            "新建或编辑物资表单；有 id 为编辑，无 id 为新建（可预填字段）",
            List.of(),
            List.of(
                "id", "spaceId", "name", "quantity", "unit", "note", "spaceName", "locationName",
                "expireDate", "productionDate"),
            "去编辑物资",
            true));
    pages.add(
        page(
            "items.detail",
            "/packageBrowse/items/detail",
            "物资详情；必须带物资 id（或本轮 F*/P* 短号 ref）",
            List.of("id"),
            List.of(),
            "查看物资详情",
            true));
    pages.add(page("spaces.list", "/packageBrowse/spaces/index", "家庭空间列表", List.of(), List.of(), "打开空间", false));
    pages.add(
        page(
            "spaces.detail",
            "/packageBrowse/spaces/detail",
            "单个空间详情与其中物资；必须带空间 id",
            List.of("id"),
            List.of("name"),
            "查看空间",
            false));
    pages.add(page("family.home", "/pages/family/index", "家庭页（钥匙、工具、切换家）", List.of(), List.of(), "打开家庭", false));
    pages.add(page("family.tags", "/pages/family/tags", "家庭标签管理（新建/整理标签名）", List.of(), List.of(), "打开标签管理", false));
    pages.add(page("family.messages", "/pages/family/messages", "家庭消息中心", List.of(), List.of(), "打开消息", false));
    pages.add(page("ai.keys", "/packageAi/keys/index", "家庭 AI 密钥设置（BYOK）", List.of(), List.of(), "设置 AI 密钥", false));
    pages.add(
        page(
            "onboarding",
            "/pages/onboarding/index",
            "创建或加入家庭；可带邀请码",
            List.of(),
            List.of("inviteCode"),
            "创建或加入家庭",
            false));
    return pages;
  }

  private static Map<String, Object> page(
      String pageId,
      String path,
      String hint,
      List<String> required,
      List<String> optional,
      String label,
      boolean allowRefAsId) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("pageId", pageId);
    m.put("path", path);
    m.put("hint", hint);
    m.put("required", required);
    m.put("optional", optional);
    m.put("label", label);
    m.put("allowRefAsId", allowRefAsId);
    m.put("enabled", true);
    return m;
  }
}
