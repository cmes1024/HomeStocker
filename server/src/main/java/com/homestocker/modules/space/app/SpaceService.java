package com.homestocker.modules.space.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.jdbc.StructureRepository.LocationRow;
import com.homestocker.infra.jdbc.StructureRepository.SpaceRow;
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
public class SpaceService {

  private static final int MANY_LIMIT = 20;
  private static final int REORDER_LIMIT = 100;
  private static final String DEFAULT_COVER = "default-indoor";

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final StructureRepository structureRepository;
  private final ItemRepository itemRepository;
  private final FamilyTreeService familyTreeService;

  public SpaceService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      StructureRepository structureRepository,
      ItemRepository itemRepository,
      FamilyTreeService familyTreeService) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.structureRepository = structureRepository;
    this.itemRepository = itemRepository;
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

  private Map<String, Object> spaceView(SpaceRow s) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", s.id());
    m.put("familyId", s.familyId());
    m.put("name", s.name());
    m.put("floorId", s.floorId());
    m.put("isDefault", s.isDefault());
    m.put("coverKey", s.coverKey() == null ? DEFAULT_COVER : s.coverKey());
    if (s.imageKey() != null && !s.imageKey().isBlank()) {
      m.put("imageFileID", s.imageKey());
    }
    m.put("createdAt", TimeJson.toEpochMs(s.createdAt()));
    m.put("updatedAt", TimeJson.toEpochMs(s.updatedAt()));
    return m;
  }

  private Map<String, Object> locationView(LocationRow l) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", l.id());
    m.put("familyId", l.familyId());
    m.put("spaceId", l.spaceId());
    m.put("name", l.name());
    if (l.imageKey() != null && !l.imageKey().isBlank()) {
      m.put("imageFileID", l.imageKey());
    }
    m.put("createdAt", TimeJson.toEpochMs(l.createdAt()));
    m.put("updatedAt", TimeJson.toEpochMs(l.updatedAt()));
    return m;
  }

  private String normalizeImage(Object raw, boolean present) {
    if (!present) {
      return "__skip__";
    }
    if (raw == null || "".equals(raw)) {
      return "";
    }
    return String.valueOf(raw).trim();
  }

  @Transactional
  public Map<String, Object> ensureDefault() {
    Ctx ctx = requireFamily();
    List<SpaceRow> spaces = structureRepository.listSpaceRows(ctx.familyId());
    if (!spaces.isEmpty()) {
      SpaceRow preferred =
          spaces.stream().filter(SpaceRow::isDefault).findFirst().orElse(spaces.get(0));
      Map<String, Object> out = spaceView(preferred);
      out.put("created", false);
      return out;
    }
    String id = UUID.randomUUID().toString();
    Timestamp now = TimeJson.nowTs();
    structureRepository.insertSpace(
        id, ctx.familyId(), "仓库", null, true, DEFAULT_COVER, "", now);
    structureRepository.backfillOrphanItems(ctx.familyId(), id);
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = spaceView(structureRepository.findSpaceRow(ctx.familyId(), id).orElseThrow());
    out.put("created", true);
    return out;
  }

  public Map<String, Object> list() {
    Ctx ctx = requireFamily();
    List<Map<String, Object>> list = new ArrayList<>();
    for (SpaceRow s : structureRepository.listSpaceRows(ctx.familyId())) {
      list.add(spaceView(s));
    }
    return Map.of("list", list);
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入空间名称");
    }
    String coverKey =
        body.get("coverKey") == null ? DEFAULT_COVER : str(body.get("coverKey")).trim();
    if (coverKey.isEmpty()) {
      coverKey = DEFAULT_COVER;
    }
    String floorId =
        body.get("floorId") == null || "".equals(body.get("floorId"))
            ? null
            : str(body.get("floorId")).trim();
    String imageKey = "";
    if (body.containsKey("imageFileID")) {
      imageKey = normalizeImage(body.get("imageFileID"), true);
    }
    boolean isDefault = structureRepository.countSpaces(ctx.familyId()) == 0;
    String id = UUID.randomUUID().toString();
    Timestamp now = TimeJson.nowTs();
    structureRepository.insertSpace(
        id, ctx.familyId(), name, floorId, isDefault, coverKey, imageKey, now);
    familyTreeService.rebuild(ctx.familyId());
    return spaceView(structureRepository.findSpaceRow(ctx.familyId(), id).orElseThrow());
  }

  @Transactional
  @SuppressWarnings("unchecked")
  public Map<String, Object> createMany(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    Object raw = body.get("spaces");
    if (!(raw instanceof List<?> list) || list.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "没有要创建的空间");
    }
    if (list.size() > MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "一次最多创建 " + MANY_LIMIT + " 个空间");
    }
    boolean emptyHome = structureRepository.countSpaces(ctx.familyId()) == 0;
    Timestamp now = TimeJson.nowTs();
    List<Map<String, Object>> created = new ArrayList<>();
    int i = 0;
    for (Object rowObj : list) {
      Map<String, Object> row =
          rowObj instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
      String name = str(row.get("name")).trim();
      if (name.isEmpty()) {
        throw ApiException.of(ErrorCodes.INVALID_NAME, "第 " + (i + 1) + " 个缺少名称");
      }
      String id = UUID.randomUUID().toString();
      boolean isDefault = emptyHome && i == 0;
      structureRepository.insertSpace(
          id, ctx.familyId(), name, null, isDefault, DEFAULT_COVER, "", now);
      created.add(spaceView(structureRepository.findSpaceRow(ctx.familyId(), id).orElseThrow()));
      i++;
    }
    familyTreeService.rebuild(ctx.familyId());
    return Map.of("list", created, "count", created.size());
  }

  @Transactional
  public Map<String, Object> update(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String spaceId = str(body.get("spaceId")).trim();
    if (spaceId.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_ID, "空间无效");
    }
    SpaceRow before =
        structureRepository
            .findSpaceRow(ctx.familyId(), spaceId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
    String name = body.containsKey("name") ? str(body.get("name")).trim() : before.name();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入空间名称");
    }
    String coverKey =
        body.containsKey("coverKey") ? str(body.get("coverKey")).trim() : before.coverKey();
    if (coverKey == null || coverKey.isEmpty()) {
      coverKey = DEFAULT_COVER;
    }
    String imageKey = before.imageKey();
    if (body.containsKey("imageFileID")) {
      imageKey = normalizeImage(body.get("imageFileID"), true);
    }
    structureRepository.updateSpace(spaceId, name, coverKey, imageKey, TimeJson.nowTs());
    familyTreeService.rebuild(ctx.familyId());
    return spaceView(structureRepository.findSpaceRow(ctx.familyId(), spaceId).orElseThrow());
  }

  @Transactional
  public Map<String, Object> remove(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String spaceId = str(body.get("spaceId")).trim();
    SpaceRow space =
        structureRepository
            .findSpaceRow(ctx.familyId(), spaceId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
    if (space.isDefault()) {
      throw ApiException.of(ErrorCodes.DEFAULT_SPACE, "默认空间不能删除");
    }
    List<SpaceRow> all = structureRepository.listSpaceRows(ctx.familyId());
    if (all.size() <= 1) {
      throw ApiException.of(ErrorCodes.LAST_SPACE, "至少保留一个空间");
    }
    SpaceRow target =
        all.stream()
            .filter(s -> !s.id().equals(spaceId) && s.isDefault())
            .findFirst()
            .orElseGet(
                () ->
                    all.stream()
                        .filter(s -> !s.id().equals(spaceId))
                        .findFirst()
                        .orElseThrow());
    structureRepository.migrateItemsSpace(spaceId, target.id());
    structureRepository.deleteLocationsBySpace(spaceId);
    structureRepository.deleteSpace(spaceId);
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("spaceId", spaceId);
    out.put("name", space.name());
    out.put("migratedTo", target.id());
    out.put("migratedToName", target.name());
    return out;
  }

  @Transactional
  public Map<String, Object> removeMany(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    List<String> ids = parseIds(body.get("spaceIds"));
    if (ids.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "空间无效");
    }
    if (ids.size() > MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "一次最多删除 " + MANY_LIMIT + " 个空间");
    }
    List<SpaceRow> all = structureRepository.listSpaceRows(ctx.familyId());
    Set<String> deleteSet = new LinkedHashSet<>(ids);
    List<SpaceRow> toDelete = new ArrayList<>();
    for (String id : ids) {
      SpaceRow s =
          structureRepository
              .findSpaceRow(ctx.familyId(), id)
              .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
      if (s.isDefault()) {
        throw ApiException.of(ErrorCodes.DEFAULT_SPACE, "默认空间不能删除");
      }
      toDelete.add(s);
    }
    if (all.size() - toDelete.size() < 1) {
      throw ApiException.of(ErrorCodes.LAST_SPACE, "至少保留一个空间");
    }
    SpaceRow target =
        all.stream()
            .filter(s -> !deleteSet.contains(s.id()) && s.isDefault())
            .findFirst()
            .orElseGet(
                () ->
                    all.stream()
                        .filter(s -> !deleteSet.contains(s.id()))
                        .findFirst()
                        .orElseThrow());
    List<String> names = new ArrayList<>();
    for (SpaceRow s : toDelete) {
      structureRepository.migrateItemsSpace(s.id(), target.id());
      structureRepository.deleteLocationsBySpace(s.id());
      structureRepository.deleteSpace(s.id());
      names.add(s.name());
    }
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("spaceIds", ids);
    out.put("names", names);
    out.put("count", ids.size());
    out.put("migratedTo", target.id());
    out.put("migratedToName", target.name());
    return out;
  }

  /**
   * 重排家庭空间。客户端提交重排后的完整 spaceIds（含默认空间），服务端按索引全量重编号；
   * 顺序不完整 / 含未知 id 一律拒绝，避免半量提交把排序写乱。
   */
  @Transactional
  public Map<String, Object> reorder(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    List<String> ids = parseIds(body.get("spaceIds"));
    if (ids.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "空间无效");
    }
    if (ids.size() > REORDER_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "一次最多排序 " + REORDER_LIMIT + " 个空间");
    }
    // 列表接口单页 100 条：家庭空间超过上限时客户端永远凑不齐完整顺序，
    // 直接给明确错误，而不是让「半量提交」被拒得莫名其妙。
    if (structureRepository.countSpaces(ctx.familyId()) > REORDER_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "空间超过 " + REORDER_LIMIT + " 个，暂不支持重排");
    }
    List<SpaceRow> all = structureRepository.listSpaceRows(ctx.familyId());
    if (all.size() != ids.size()) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "请提交完整的空间顺序");
    }
    Set<String> existing = new LinkedHashSet<>();
    for (SpaceRow s : all) {
      existing.add(s.id());
    }
    for (String id : ids) {
      if (!existing.contains(id)) {
        throw ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在");
      }
    }
    structureRepository.renumberSpaces(ctx.familyId(), ids);
    familyTreeService.rebuild(ctx.familyId());
    List<Map<String, Object>> list = new ArrayList<>();
    for (SpaceRow s : structureRepository.listSpaceRows(ctx.familyId())) {
      list.add(spaceView(s));
    }
    return Map.of("list", list);
  }

  public Map<String, Object> listLocations(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String spaceId = str(body.get("spaceId")).trim();
    structureRepository
        .findSpaceRow(ctx.familyId(), spaceId)
        .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
    List<Map<String, Object>> list = new ArrayList<>();
    for (LocationRow l : structureRepository.listLocationRowsBySpace(ctx.familyId(), spaceId)) {
      list.add(locationView(l));
    }
    return Map.of("list", list);
  }

  @Transactional
  public Map<String, Object> createLocation(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String spaceId = str(body.get("spaceId")).trim();
    structureRepository
        .findSpaceRow(ctx.familyId(), spaceId)
        .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入位置名称");
    }
    String imageKey =
        body.containsKey("imageFileID") ? normalizeImage(body.get("imageFileID"), true) : "";
    String id = UUID.randomUUID().toString();
    structureRepository.insertLocation(
        id, ctx.familyId(), spaceId, name, imageKey, TimeJson.nowTs());
    familyTreeService.rebuild(ctx.familyId());
    return locationView(structureRepository.findLocationRow(id).orElseThrow());
  }

  @Transactional
  @SuppressWarnings("unchecked")
  public Map<String, Object> createLocationMany(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    Object raw = body.get("locations");
    if (!(raw instanceof List<?> list) || list.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "没有要创建的位置");
    }
    if (list.size() > MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "一次最多创建 " + MANY_LIMIT + " 个位置");
    }
    Timestamp now = TimeJson.nowTs();
    List<Map<String, Object>> created = new ArrayList<>();
    int step = 0;
    for (Object rowObj : list) {
      step++;
      Map<String, Object> row =
          rowObj instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
      String spaceId = str(row.get("spaceId")).trim();
      String name = str(row.get("name")).trim();
      if (spaceId.isEmpty()) {
        throw ApiException.of(ErrorCodes.INVALID_ID, "第 " + step + " 个缺少空间");
      }
      if (name.isEmpty()) {
        throw ApiException.of(ErrorCodes.INVALID_NAME, "第 " + step + " 个缺少名称");
      }
      structureRepository
          .findSpaceRow(ctx.familyId(), spaceId)
          .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
      String id = UUID.randomUUID().toString();
      structureRepository.insertLocation(id, ctx.familyId(), spaceId, name, "", now);
      created.add(locationView(structureRepository.findLocationRow(id).orElseThrow()));
    }
    familyTreeService.rebuild(ctx.familyId());
    return Map.of("list", created, "count", created.size());
  }

  @Transactional
  public Map<String, Object> updateLocation(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String locationId = str(body.get("locationId")).trim();
    LocationRow before =
        structureRepository
            .findLocationRow(locationId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "位置不存在"));
    if (!ctx.familyId().equals(before.familyId())) {
      throw ApiException.of(ErrorCodes.FORBIDDEN, "无权操作");
    }
    String name = body.containsKey("name") ? str(body.get("name")).trim() : before.name();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入位置名称");
    }
    String imageKey = before.imageKey();
    if (body.containsKey("imageFileID")) {
      imageKey = normalizeImage(body.get("imageFileID"), true);
    }
    structureRepository.updateLocation(locationId, name, imageKey, TimeJson.nowTs());
    familyTreeService.rebuild(ctx.familyId());
    return locationView(structureRepository.findLocationRow(locationId).orElseThrow());
  }

  @Transactional
  public Map<String, Object> removeLocation(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String locationId = str(body.get("locationId")).trim();
    LocationRow loc =
        structureRepository
            .findLocationRow(locationId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "位置不存在"));
    if (!ctx.familyId().equals(loc.familyId())) {
      throw ApiException.of(ErrorCodes.FORBIDDEN, "无权操作");
    }
    structureRepository.clearItemsLocation(locationId);
    structureRepository.deleteLocation(locationId);
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("locationId", locationId);
    out.put("name", loc.name());
    out.put("spaceId", loc.spaceId());
    return out;
  }

  @Transactional
  public Map<String, Object> removeLocationMany(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    List<String> ids = parseIds(body.get("locationIds"));
    if (ids.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "位置无效");
    }
    if (ids.size() > MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "一次最多删除 " + MANY_LIMIT + " 个位置");
    }
    List<String> names = new ArrayList<>();
    for (String id : ids) {
      LocationRow loc =
          structureRepository
              .findLocationRow(id)
              .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "位置不存在"));
      if (!ctx.familyId().equals(loc.familyId())) {
        throw ApiException.of(ErrorCodes.FORBIDDEN, "无权操作");
      }
      structureRepository.clearItemsLocation(id);
      structureRepository.deleteLocation(id);
      names.add(loc.name());
    }
    familyTreeService.rebuild(ctx.familyId());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("locationIds", ids);
    out.put("names", names);
    out.put("count", ids.size());
    return out;
  }

  public Map<String, Object> listItemsBySpace(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String spaceId = str(body.get("spaceId")).trim();
    SpaceRow space =
        structureRepository
            .findSpaceRow(ctx.familyId(), spaceId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
    int limit = clamp(body.get("limit"), 100, 1, 100);
    Map<String, String> locNames =
        structureRepository.locationNames(
            ctx.familyId(),
            structureRepository.listLocationRowsBySpace(ctx.familyId(), spaceId).stream()
                .map(LocationRow::id)
                .toList());
    List<Map<String, Object>> list = new ArrayList<>();
    for (var item : itemRepository.list(ctx.familyId(), spaceId, null, limit)) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("_id", item.id());
      m.put("name", item.name());
      m.put("quantity", item.quantity());
      m.put("unit", item.unit());
      m.put("spaceId", item.spaceId());
      m.put("locationId", item.locationId());
      m.put(
          "locationName",
          item.locationId() == null ? "" : locNames.getOrDefault(item.locationId(), ""));
      m.put("updatedAt", TimeJson.toEpochMs(item.updatedAt()));
      list.add(m);
    }
    return Map.of("space", spaceView(space), "list", list);
  }

  public Map<String, Object> detail(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    String spaceId = str(body.get("spaceId")).trim();
    SpaceRow space =
        structureRepository
            .findSpaceRow(ctx.familyId(), spaceId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "空间不存在"));
    List<Map<String, Object>> locations = new ArrayList<>();
    for (LocationRow l : structureRepository.listLocationRowsBySpace(ctx.familyId(), spaceId)) {
      locations.add(locationView(l));
    }
    Map<String, Object> itemsBundle = listItemsBySpace(body);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("space", spaceView(space));
    out.put("locations", locations);
    out.put("list", itemsBundle.get("list"));
    return out;
  }

  @Transactional
  public Map<String, Object> listPockets(Map<String, Object> body) {
    Ctx ctx = requireFamily();
    List<SpaceRow> spaces = structureRepository.listSpaceRows(ctx.familyId());
    if (spaces.isEmpty()) {
      ensureDefault();
      spaces = structureRepository.listSpaceRows(ctx.familyId());
    }
    int limit = clamp(body.get("limit"), 100, 1, 100);
    List<Map<String, Object>> pockets = new ArrayList<>();
    for (SpaceRow space : spaces) {
      Map<String, Object> slim = new LinkedHashMap<>();
      slim.put("_id", space.id());
      slim.put("name", space.name());
      slim.put("isDefault", space.isDefault());
      Map<String, Object> items =
          listItemsBySpace(Map.of("spaceId", space.id(), "limit", limit));
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> list = (List<Map<String, Object>>) items.get("list");
      Map<String, Object> pocket = new LinkedHashMap<>();
      pocket.put("space", slim);
      pocket.put("list", list);
      pocket.put("capped", list.size() >= limit);
      pockets.add(pocket);
    }
    return Map.of("pockets", pockets);
  }

  private static List<String> parseIds(Object raw) {
    if (!(raw instanceof List<?> list)) {
      return List.of();
    }
    List<String> ids = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (Object o : list) {
      String id = o == null ? "" : String.valueOf(o).trim();
      if (!id.isEmpty() && seen.add(id)) {
        ids.add(id);
      }
    }
    return ids;
  }

  private static int clamp(Object raw, int def, int min, int max) {
    int n = def;
    if (raw != null) {
      try {
        n = Integer.parseInt(String.valueOf(raw));
      } catch (NumberFormatException ignored) {
      }
    }
    return Math.min(Math.max(n, min), max);
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
