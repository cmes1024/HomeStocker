package com.homestocker.modules.tag.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.jdbc.StructureRepository.TagRow;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.app.FamilyTreeService;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TagService {

  private static final int MANY_LIMIT = 20;
  private static final List<String> DEFAULT_TAGS = List.of("药品", "饮料", "工具", "衣物");

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final FamilyRepository familyRepository;
  private final StructureRepository structureRepository;
  private final FamilyTreeService familyTreeService;

  public TagService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      FamilyRepository familyRepository,
      StructureRepository structureRepository,
      FamilyTreeService familyTreeService) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.familyRepository = familyRepository;
    this.structureRepository = structureRepository;
    this.familyTreeService = familyTreeService;
  }

  private record Ctx(String openid, String familyId) {}

  private Ctx requireFamily() {
    String openid = RequestContext.require().openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return new Ctx(openid, familyId);
  }

  private Map<String, Object> tagView(TagRow t) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", t.id());
    m.put("familyId", t.familyId());
    m.put("name", t.name());
    m.put("isDefault", t.isDefault());
    m.put("createdAt", TimeJson.toEpochMs(t.createdAt()));
    m.put("updatedAt", TimeJson.toEpochMs(t.updatedAt()));
    return m;
  }

  @Transactional
  public Map<String, Object> ensureDefaults() {
    Ctx ctx = requireFamily();
    var family = familyRepository.findById(ctx.familyId()).orElseThrow();
    List<TagRow> existing = structureRepository.listTagRows(ctx.familyId());
    if (family.tagsSeededAt() != null) {
      return Map.of("list", existing.stream().map(this::tagView).toList(), "seeded", false);
    }
    if (!existing.isEmpty()) {
      familyRepository.updateTagsSeededAt(ctx.familyId(), TimeJson.nowTs());
      return Map.of("list", existing.stream().map(this::tagView).toList(), "seeded", false);
    }
    Timestamp now = TimeJson.nowTs();
    long base = now.getTime();
    List<Map<String, Object>> list = new ArrayList<>();
    for (int i = 0; i < DEFAULT_TAGS.size(); i++) {
      String id = UUID.randomUUID().toString();
      structureRepository.insertTag(
          id, ctx.familyId(), DEFAULT_TAGS.get(i), true, new Timestamp(base + i));
      list.add(tagView(structureRepository.findTagRow(ctx.familyId(), id).orElseThrow()));
    }
    familyRepository.updateTagsSeededAt(ctx.familyId(), now);
    familyTreeService.rebuild(ctx.familyId());
    return Map.of("list", list, "seeded", true);
  }

  public Map<String, Object> list() {
    Ctx ctx = requireFamily();
    return Map.of(
        "list",
        structureRepository.listTagRows(ctx.familyId()).stream().map(this::tagView).toList());
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入标签名称");
    }
    if (name.length() > 20) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "标签名称过长");
    }
    if (structureRepository.tagNameExists(ctx.familyId(), name, null)) {
      throw ApiException.of(ErrorCodes.DUPLICATE_NAME, "标签已存在");
    }
    String id = UUID.randomUUID().toString();
    structureRepository.insertTag(id, ctx.familyId(), name, false, TimeJson.nowTs());
    familyTreeService.rebuild(ctx.familyId());
    return tagView(structureRepository.findTagRow(ctx.familyId(), id).orElseThrow());
  }

  @Transactional
  @SuppressWarnings("unchecked")
  public Map<String, Object> createMany(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    Object raw = body.get("tags");
    if (!(raw instanceof List<?> list) || list.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "没有要创建的标签");
    }
    if (list.size() > MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "一次最多创建 " + MANY_LIMIT + " 个标签");
    }
    List<String> names = new ArrayList<>();
    Set<String> batchSeen = new LinkedHashSet<>();
    int step = 0;
    for (Object rowObj : list) {
      step++;
      String name;
      if (rowObj instanceof Map<?, ?> m) {
        name = str(m.get("name")).trim();
      } else {
        name = str(rowObj).trim();
      }
      if (name.isEmpty()) {
        throw ApiException.of(ErrorCodes.INVALID_NAME, "第 " + step + " 个缺少名称");
      }
      if (name.length() > 20) {
        throw ApiException.of(ErrorCodes.INVALID_NAME, "第 " + step + " 个名称过长");
      }
      if (!batchSeen.add(name) || structureRepository.tagNameExists(ctx.familyId(), name, null)) {
        throw ApiException.of(ErrorCodes.DUPLICATE_NAME, "标签已存在");
      }
      names.add(name);
    }
    Timestamp now = TimeJson.nowTs();
    List<Map<String, Object>> created = new ArrayList<>();
    for (String name : names) {
      String id = UUID.randomUUID().toString();
      structureRepository.insertTag(id, ctx.familyId(), name, false, now);
      created.add(tagView(structureRepository.findTagRow(ctx.familyId(), id).orElseThrow()));
    }
    familyTreeService.rebuild(ctx.familyId());
    return Map.of("list", created, "count", created.size());
  }

  @Transactional
  public Map<String, Object> update(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String tagId = str(body.get("tagId")).trim();
    TagRow before =
        structureRepository
            .findTagRow(ctx.familyId(), tagId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "标签不存在"));
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入标签名称");
    }
    if (name.length() > 20) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "标签名称过长");
    }
    if (structureRepository.tagNameExists(ctx.familyId(), name, tagId)) {
      throw ApiException.of(ErrorCodes.DUPLICATE_NAME, "标签已存在");
    }
    structureRepository.updateTag(tagId, name, TimeJson.nowTs());
    familyTreeService.rebuild(ctx.familyId());
    return tagView(structureRepository.findTagRow(ctx.familyId(), tagId).orElseThrow());
  }

  @Transactional
  public Map<String, Object> remove(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String tagId = str(body.get("tagId")).trim();
    TagRow tag =
        structureRepository
            .findTagRow(ctx.familyId(), tagId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "标签不存在"));
    structureRepository.stripTagFromItems(tagId);
    structureRepository.deleteTag(tagId);
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("tagId", tagId);
    out.put("name", tag.name());
    return out;
  }

  @Transactional
  public Map<String, Object> removeMany(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    Object raw = body.get("tagIds");
    if (!(raw instanceof List<?> list) || list.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "标签无效");
    }
    if (list.size() > MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "一次最多删除 " + MANY_LIMIT + " 个标签");
    }
    List<String> ids = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (Object o : list) {
      String id = o == null ? "" : String.valueOf(o).trim();
      if (!id.isEmpty() && seen.add(id)) {
        ids.add(id);
      }
    }
    List<String> names = new ArrayList<>();
    for (String id : ids) {
      TagRow tag =
          structureRepository
              .findTagRow(ctx.familyId(), id)
              .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "标签不存在"));
      structureRepository.stripTagFromItems(id);
      structureRepository.deleteTag(id);
      names.add(tag.name());
    }
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("tagIds", ids);
    out.put("names", names);
    out.put("count", ids.size());
    return out;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
