package com.homestocker.modules.ai.tools;

import com.homestocker.modules.item.app.ItemService;
import com.homestocker.modules.space.app.SpaceService;
import com.homestocker.modules.tag.app.TagService;
import java.util.LinkedHashMap;
import java.util.Map;

/** Mutable execution context for one act tool run batch. */
public class ToolContext {

  public final String openid;
  public final String familyId;
  public Map<String, Object> tree;
  public boolean treeDirty;
  public final Map<String, Map<String, Object>> refs;
  public final Map<String, Map<String, Object>> catalogMap;
  public final String todayYmd;

  public final ItemService itemService;
  public final SpaceService spaceService;
  public final TagService tagService;

  public int knowledgeGetCount;
  public int pageGetCount;

  public ToolContext(
      String openid,
      String familyId,
      Map<String, Object> tree,
      Map<String, Map<String, Object>> refs,
      Map<String, Map<String, Object>> catalogMap,
      String todayYmd,
      ItemService itemService,
      SpaceService spaceService,
      TagService tagService) {
    this.openid = openid;
    this.familyId = familyId;
    this.tree = tree;
    this.refs = refs != null ? refs : new LinkedHashMap<>();
    this.catalogMap = catalogMap != null ? catalogMap : Map.of();
    this.todayYmd = todayYmd;
    this.itemService = itemService;
    this.spaceService = spaceService;
    this.tagService = tagService;
  }
}
