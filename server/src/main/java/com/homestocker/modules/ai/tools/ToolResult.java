package com.homestocker.modules.ai.tools;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ToolResult {

  public final boolean ok;
  public final String summary;
  public final boolean wrote;
  public final Object remember;
  public final Map<String, Object> duplicateCheck;
  public final List<Map<String, Object>> inventory;
  public final Map<String, Object> knowledge;
  public final Map<String, Object> pageDoc;
  public final List<Map<String, Object>> pages;
  public final Map<String, Object> page;
  public final String ui;
  public final List<Map<String, Object>> subscribeItems;
  public final List<Map<String, Object>> navLinks;
  public final String inventoryPrefix;

  private ToolResult(Builder b) {
    this.ok = b.ok;
    this.summary = b.summary;
    this.wrote = b.wrote;
    this.remember = b.remember;
    this.duplicateCheck = b.duplicateCheck;
    this.inventory = b.inventory;
    this.knowledge = b.knowledge;
    this.pageDoc = b.pageDoc;
    this.pages = b.pages;
    this.page = b.page;
    this.ui = b.ui;
    this.subscribeItems = b.subscribeItems;
    this.navLinks = b.navLinks;
    this.inventoryPrefix = b.inventoryPrefix;
  }

  public static Builder ok(String summary) {
    return new Builder(true, summary);
  }

  public static Builder fail(String summary) {
    return new Builder(false, summary);
  }

  public static final class Builder {
    private final boolean ok;
    private String summary;
    private boolean wrote;
    private Object remember;
    private Map<String, Object> duplicateCheck;
    private List<Map<String, Object>> inventory;
    private Map<String, Object> knowledge;
    private Map<String, Object> pageDoc;
    private List<Map<String, Object>> pages;
    private Map<String, Object> page;
    private String ui;
    private List<Map<String, Object>> subscribeItems;
    private List<Map<String, Object>> navLinks;
    private String inventoryPrefix;

    private Builder(boolean ok, String summary) {
      this.ok = ok;
      this.summary = summary;
    }

    public Builder wrote(boolean v) {
      this.wrote = v;
      return this;
    }

    public Builder remember(Object v) {
      this.remember = v;
      return this;
    }

    public Builder duplicateCheck(Map<String, Object> v) {
      this.duplicateCheck = v;
      return this;
    }

    public Builder inventory(List<Map<String, Object>> v) {
      this.inventory = v;
      return this;
    }

    public Builder inventoryPrefix(String v) {
      this.inventoryPrefix = v;
      return this;
    }

    public Builder knowledge(Map<String, Object> v) {
      this.knowledge = v;
      return this;
    }

    public Builder pageDoc(Map<String, Object> v) {
      this.pageDoc = v;
      return this;
    }

    public Builder pages(List<Map<String, Object>> v) {
      this.pages = v;
      return this;
    }

    public Builder page(Map<String, Object> v) {
      this.page = v;
      return this;
    }

    public Builder ui(String v) {
      this.ui = v;
      return this;
    }

    public Builder subscribeItems(List<Map<String, Object>> v) {
      this.subscribeItems = v;
      return this;
    }

    public Builder navLinks(List<Map<String, Object>> v) {
      this.navLinks = v;
      return this;
    }

    public ToolResult build() {
      return new ToolResult(this);
    }
  }

  public static List<Map<String, Object>> inventoryFromRows(List<Map<String, Object>> rows) {
    return rows != null ? new ArrayList<>(rows) : List.of();
  }

  public static Map<String, Object> rememberItem(
      String itemId, String name, String op, Object qtyBefore, Object qtyAfter) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("itemId", itemId);
    m.put("name", name);
    if (op != null) {
      m.put("op", op);
    }
    if (qtyBefore != null) {
      m.put("quantityBefore", qtyBefore);
    }
    if (qtyAfter != null) {
      m.put("quantityAfter", qtyAfter);
    }
    return m;
  }
}
