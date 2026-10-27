package com.homestocker.modules.item.app;

import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.common.ShanghaiDates;
import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.ActivityRepository;
import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.FamilyRow;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.ItemRow;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.app.EntitlementService;
import com.homestocker.modules.family.app.FamilySeedService;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ItemService {

  private static final int CREATE_MANY_LIMIT = 20;

  private final UserRepository userRepository;
  private final MembershipRepository membershipRepository;
  private final FamilyRepository familyRepository;
  private final ItemRepository itemRepository;
  private final StructureRepository structureRepository;
  private final ActivityRepository activityRepository;
  private final ActivityWriteService activityWriteService;
  private final EntitlementService entitlementService;
  private final FamilySeedService familySeedService;

  public ItemService(
      UserRepository userRepository,
      MembershipRepository membershipRepository,
      FamilyRepository familyRepository,
      ItemRepository itemRepository,
      StructureRepository structureRepository,
      ActivityRepository activityRepository,
      ActivityWriteService activityWriteService,
      EntitlementService entitlementService,
      FamilySeedService familySeedService) {
    this.userRepository = userRepository;
    this.membershipRepository = membershipRepository;
    this.familyRepository = familyRepository;
    this.itemRepository = itemRepository;
    this.structureRepository = structureRepository;
    this.activityRepository = activityRepository;
    this.activityWriteService = activityWriteService;
    this.entitlementService = entitlementService;
    this.familySeedService = familySeedService;
  }

  private record FamilyCtx(String openid, String familyId) {}

  private FamilyCtx requireFamily() {
    String openid = RequestContext.require().openid();
    UserRow user = userRepository.ensureUser(openid);
    String familyId = user.currentFamilyId();
    if (familyId == null || familyId.isBlank()) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    if (!membershipRepository.exists(openid, familyId)) {
      throw ApiException.of(ErrorCodes.NO_FAMILY, "尚未加入家庭");
    }
    return new FamilyCtx(openid, familyId);
  }

  private ItemRow requireItemInFamily(String itemId, String familyId) {
    if (itemId == null || itemId.isBlank()) {
      throw ApiException.of(ErrorCodes.INVALID_ID, "物资无效");
    }
    ItemRow item =
        itemRepository
            .findById(itemId)
            .orElseThrow(() -> ApiException.of(ErrorCodes.NOT_FOUND, "物资不存在"));
    if (!familyId.equals(item.familyId())) {
      throw ApiException.of(ErrorCodes.FORBIDDEN, "无权操作该物资");
    }
    return item;
  }

  private void assertItemCapacity(String familyId, int addN) {
    int count = familyRepository.getItemCount(familyId);
    if (count < 0) {
      count = itemRepository.countByFamily(familyId);
      familyRepository.setItemCount(familyId, count);
    }
    var ent = entitlementService.resolveForFamily(familyId);
    Integer limit = ent.itemLimit();
    if (limit != null && count + addN > limit) {
      throw ApiException.of(
          ErrorCodes.ITEM_LIMIT_REACHED,
          "已达免费物资上限（" + limit + " 件），可到家庭页兑换内测加强版");
    }
  }

  private static BigDecimal normalizeQuantity(Object value, BigDecimal fallback) {
    if (value == null || "".equals(value)) {
      return fallback;
    }
    try {
      BigDecimal n = new BigDecimal(String.valueOf(value));
      if (n.compareTo(BigDecimal.ZERO) < 0) {
        return null;
      }
      return n;
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static String sourceOf(Object raw) {
    return "agent".equals(raw) ? "agent" : "ui";
  }

  private List<String> resolveTagIds(String familyId, Object tagIds, boolean required) {
    if (tagIds == null) {
      if (required) {
        return List.of();
      }
      return null; // skip
    }
    if ("".equals(tagIds)) {
      return List.of();
    }
    if (!(tagIds instanceof List<?> list)) {
      throw ApiException.of(ErrorCodes.INVALID_TAGS, "标签格式无效");
    }
    List<String> unique = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (Object o : list) {
      String id = o == null ? "" : String.valueOf(o).trim();
      if (id.isEmpty() || !seen.add(id)) {
        continue;
      }
      unique.add(id);
    }
    if (unique.size() > 20) {
      throw ApiException.of(ErrorCodes.INVALID_TAGS, "标签过多");
    }
    if (!unique.isEmpty()
        && itemRepository.countTagsInFamily(familyId, unique) != unique.size()) {
      throw ApiException.of(ErrorCodes.INVALID_TAGS, "标签不属于当前家庭");
    }
    return unique;
  }

  private List<String> normalizeImages(Map<String, Object> body, boolean allowSkip) {
    if (!body.containsKey("imageFileIDs") && !body.containsKey("imageFileID")) {
      return allowSkip ? null : List.of();
    }
    List<String> raw = new ArrayList<>();
    if (body.get("imageFileIDs") instanceof List<?> list) {
      for (Object o : list) {
        if (o != null) {
          raw.add(String.valueOf(o).trim());
        }
      }
    } else if (body.get("imageFileID") != null) {
      String one = String.valueOf(body.get("imageFileID")).trim();
      if (!one.isEmpty()) {
        raw.add(one);
      }
    }
    List<String> out = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (String s : raw) {
      if (s.isEmpty() || !seen.add(s)) {
        continue;
      }
      if (!(s.startsWith("cloud://")
          || s.startsWith("http://")
          || s.startsWith("https://")
          || !s.contains("://"))) {
        // allow object keys without scheme (MinIO later); reject obvious junk only
      }
      if (s.contains("://")
          && !(s.startsWith("cloud://") || s.startsWith("http://") || s.startsWith("https://"))) {
        throw ApiException.of(ErrorCodes.INVALID_IMAGE, "图片无效");
      }
      out.add(s);
      if (out.size() > 3) {
        throw ApiException.of(ErrorCodes.INVALID_IMAGE, "图片无效");
      }
    }
    return out;
  }

  private String resolveSpaceId(String familyId, Object spaceIdRaw) {
    String spaceId = spaceIdRaw == null ? "" : String.valueOf(spaceIdRaw).trim();
    if (spaceId.isEmpty()) {
      return structureRepository.ensureDefaultSpaceId(familyId);
    }
    structureRepository
        .findSpace(familyId, spaceId)
        .orElseThrow(() -> ApiException.of(ErrorCodes.INVALID_SPACE, "空间无效"));
    return spaceId;
  }

  private String resolveLocationId(String familyId, String spaceId, Object locationIdRaw) {
    if (locationIdRaw == null) {
      return null;
    }
    String locationId = String.valueOf(locationIdRaw).trim();
    if (locationId.isEmpty()) {
      return null;
    }
    structureRepository
        .findLocation(familyId, spaceId, locationId)
        .orElseThrow(() -> ApiException.of(ErrorCodes.INVALID_LOCATION, "位置无效"));
    return locationId;
  }

  private Map<String, String> snapshotPlace(String familyId, String spaceId, String locationId) {
    Map<String, String> place = new LinkedHashMap<>();
    place.put("spaceId", spaceId == null ? "" : spaceId);
    place.put(
        "spaceName",
        spaceId == null
            ? ""
            : structureRepository.spaceNames(familyId, List.of(spaceId)).getOrDefault(spaceId, ""));
    place.put("locationId", locationId == null ? "" : locationId);
    place.put(
        "locationName",
        locationId == null
            ? ""
            : structureRepository
                .locationNames(familyId, List.of(locationId))
                .getOrDefault(locationId, ""));
    return place;
  }

  private Map<String, Object> toView(ItemRow item, boolean expireReminderEnabled) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("_id", item.id());
    m.put("familyId", item.familyId());
    m.put("name", item.name());
    m.put("quantity", item.quantity());
    m.put("unit", item.unit() == null ? "" : item.unit());
    m.put("note", item.note() == null ? "" : item.note());
    m.put("spaceId", item.spaceId());
    m.put("locationId", item.locationId());
    m.put("tagIds", item.tagIds() == null ? List.of() : item.tagIds());
    m.put(
        "productionDate",
        item.productionDate() == null ? null : item.productionDate().toString());
    m.put("expireDate", item.expireDate() == null ? null : item.expireDate().toString());
    List<String> images = item.imageFileIDs() == null ? List.of() : item.imageFileIDs();
    m.put("imageFileIDs", images);
    if (!images.isEmpty()) {
      m.put("imageFileID", images.get(0));
    }
    m.put("createdBy", item.createdBy());
    m.put("source", item.source());
    m.put("createdAt", TimeJson.toEpochMs(item.createdAt()));
    m.put("updatedAt", TimeJson.toEpochMs(item.updatedAt()));
    m.put("expireReminderEnabled", expireReminderEnabled);
    return m;
  }

  private static Date toSqlDate(String ymd) {
    return ymd == null ? null : Date.valueOf(ymd);
  }

  private boolean syncExpireSub(
      String familyId, String itemId, String openid, Boolean want, String expireDate) {
    if (expireDate == null || expireDate.isBlank()) {
      itemRepository.removeExpireSubsForItem(itemId);
      return false;
    }
    if (want == null) {
      return itemRepository.hasExpireSub(itemId, openid);
    }
    if (want) {
      itemRepository.upsertExpireSub(familyId, itemId, openid);
      return true;
    }
    itemRepository.removeExpireSub(itemId, openid);
    return false;
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    String name = str(body.get("name")).trim();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入物资名称");
    }
    BigDecimal quantity = normalizeQuantity(body.get("quantity"), BigDecimal.ONE);
    if (quantity == null) {
      throw ApiException.of(ErrorCodes.INVALID_QUANTITY, "数量无效");
    }
    String unit = body.get("unit") == null ? "" : str(body.get("unit")).trim();
    if (unit.length() > 10) {
      unit = unit.substring(0, 10);
    }
    String note = body.get("note") == null ? "" : str(body.get("note"));
    String source = sourceOf(body.get("source"));
    String spaceId = resolveSpaceId(ctx.familyId(), body.get("spaceId"));
    String locationId = resolveLocationId(ctx.familyId(), spaceId, body.get("locationId"));
    List<String> tagIds = resolveTagIds(ctx.familyId(), body.get("tagIds"), true);
    if (tagIds == null) {
      tagIds = List.of();
    }

    String productionDate = parseDate(body, "productionDate", false);
    String expireDate = parseDate(body, "expireDate", false);
    List<String> images = normalizeImages(body, true);
    if (images == null) {
      images = List.of();
    }

    assertItemCapacity(ctx.familyId(), 1);
    String id = UUID.randomUUID().toString();
    Timestamp now = TimeJson.nowTs();
    itemRepository.insert(
        id,
        ctx.familyId(),
        name,
        quantity,
        unit,
        note,
        spaceId,
        locationId,
        toSqlDate(productionDate),
        toSqlDate(expireDate),
        ctx.openid(),
        source,
        now);
    itemRepository.replaceTags(id, tagIds);
    if (!images.isEmpty()) {
      itemRepository.replaceImages(id, images);
    }
    familyRepository.bumpItemCount(ctx.familyId(), 1);

    Boolean want =
        body.containsKey("expireReminderEnabled")
            ? Boolean.TRUE.equals(body.get("expireReminderEnabled"))
            : null;
    boolean mine = syncExpireSub(ctx.familyId(), id, ctx.openid(), want, expireDate);

    Map<String, String> place = snapshotPlace(ctx.familyId(), spaceId, locationId);
    activityWriteService.append(
        ctx.familyId(),
        id,
        "create",
        ctx.openid(),
        name,
        null,
        place.get("spaceId"),
        place.get("spaceName"),
        place.get("locationId"),
        place.get("locationName"),
        quantity,
        unit,
        null,
        null,
        source);

    ItemRow saved = itemRepository.findById(id).orElseThrow();
    return toView(saved, mine);
  }

  @Transactional
  @SuppressWarnings("unchecked")
  public Map<String, Object> createMany(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    Object raw = body.get("items");
    if (!(raw instanceof List<?> rawItems) || rawItems.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_ITEMS, "没有要写入的物资");
    }
    if (rawItems.size() > CREATE_MANY_LIMIT) {
      throw ApiException.of(
          ErrorCodes.INVALID_ITEMS, "一次最多记 " + CREATE_MANY_LIMIT + " 件");
    }
    assertItemCapacity(ctx.familyId(), rawItems.size());
    String defaultSource = sourceOf(body.get("source"));
    List<Map<String, Object>> prepared = new ArrayList<>();
    int step = 0;
    for (Object rowObj : rawItems) {
      step++;
      Map<String, Object> row =
          rowObj instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
      String name = str(row.get("name")).trim();
      if (name.isEmpty()) {
        throw ApiException.of(ErrorCodes.INVALID_NAME, "第 " + step + " 件缺少名称");
      }
      BigDecimal quantity = normalizeQuantity(row.get("quantity"), BigDecimal.ONE);
      if (quantity == null) {
        throw ApiException.of(ErrorCodes.INVALID_QUANTITY, "第 " + step + " 件数量无效");
      }
      String unit = row.get("unit") == null ? "" : str(row.get("unit")).trim();
      if (unit.length() > 10) {
        unit = unit.substring(0, 10);
      }
      String note = row.get("note") == null ? "" : str(row.get("note"));
      String source =
          "agent".equals(row.get("source")) || "agent".equals(defaultSource) ? "agent" : "ui";
      String spaceId = resolveSpaceId(ctx.familyId(), row.get("spaceId"));
      String locationId = resolveLocationId(ctx.familyId(), spaceId, row.get("locationId"));
      List<String> tagIds = resolveTagIds(ctx.familyId(), row.get("tagIds"), true);
      if (tagIds == null) {
        tagIds = List.of();
      }
      String productionDate = parseDate(row, "productionDate", false);
      String expireDate = parseDate(row, "expireDate", false);
      Map<String, Object> one = new LinkedHashMap<>();
      one.put("name", name);
      one.put("quantity", quantity);
      one.put("unit", unit);
      one.put("note", note);
      one.put("source", source);
      one.put("spaceId", spaceId);
      one.put("locationId", locationId);
      one.put("tagIds", tagIds);
      one.put("productionDate", productionDate);
      one.put("expireDate", expireDate);
      one.put(
          "wantSub",
          row.containsKey("expireReminderEnabled")
              && Boolean.TRUE.equals(row.get("expireReminderEnabled")));
      prepared.add(one);
    }

    Timestamp now = TimeJson.nowTs();
    List<Map<String, Object>> list = new ArrayList<>();
    for (Map<String, Object> p : prepared) {
      String id = UUID.randomUUID().toString();
      itemRepository.insert(
          id,
          ctx.familyId(),
          (String) p.get("name"),
          (BigDecimal) p.get("quantity"),
          (String) p.get("unit"),
          (String) p.get("note"),
          (String) p.get("spaceId"),
          (String) p.get("locationId"),
          toSqlDate((String) p.get("productionDate")),
          toSqlDate((String) p.get("expireDate")),
          ctx.openid(),
          (String) p.get("source"),
          now);
      itemRepository.replaceTags(id, (List<String>) p.get("tagIds"));
      boolean mine =
          syncExpireSub(
              ctx.familyId(),
              id,
              ctx.openid(),
              Boolean.TRUE.equals(p.get("wantSub")) ? true : null,
              (String) p.get("expireDate"));
      ItemRow saved = itemRepository.findById(id).orElseThrow();
      list.add(toView(saved, mine));
    }
    familyRepository.bumpItemCount(ctx.familyId(), prepared.size());

    if (prepared.size() == 1) {
      Map<String, Object> p = prepared.get(0);
      Map<String, String> place =
          snapshotPlace(
              ctx.familyId(), (String) p.get("spaceId"), (String) p.get("locationId"));
      activityWriteService.append(
          ctx.familyId(),
          (String) list.get(0).get("_id"),
          "create",
          ctx.openid(),
          (String) p.get("name"),
          null,
          place.get("spaceId"),
          place.get("spaceName"),
          place.get("locationId"),
          place.get("locationName"),
          (BigDecimal) p.get("quantity"),
          (String) p.get("unit"),
          null,
          null,
          (String) p.get("source"));
    } else {
      String batchName =
          prepared.stream().map(p -> (String) p.get("name")).reduce((a, b) -> a + "、" + b).orElse("");
      if (batchName.length() > 40) {
        batchName = batchName.substring(0, 40) + "…";
      }
      String source =
          prepared.stream().anyMatch(p -> "agent".equals(p.get("source"))) ? "agent" : "ui";
      activityWriteService.append(
          ctx.familyId(),
          "",
          "create_batch",
          ctx.openid(),
          batchName,
          prepared.size(),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          source);
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("list", list);
    out.put("count", list.size());
    return out;
  }

  @Transactional
  public Map<String, Object> update(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    String itemId = str(body.get("itemId")).trim();
    ItemRow before = requireItemInFamily(itemId, ctx.familyId());

    String name = before.name();
    if (body.containsKey("name")) {
      name = str(body.get("name")).trim();
      if (name.isEmpty()) {
        throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入物资名称");
      }
    }
    BigDecimal quantity = before.quantity();
    if (body.containsKey("quantity")) {
      quantity = normalizeQuantity(body.get("quantity"), null);
      if (quantity == null) {
        throw ApiException.of(ErrorCodes.INVALID_QUANTITY, "数量无效");
      }
    }
    String unit = before.unit();
    if (body.containsKey("unit")) {
      unit = str(body.get("unit")).trim();
      if (unit.length() > 10) {
        unit = unit.substring(0, 10);
      }
    }
    String note = before.note();
    if (body.containsKey("note")) {
      note = str(body.get("note"));
    }

    String spaceId = before.spaceId();
    String locationId = before.locationId();
    boolean spaceChanged = false;
    if (body.containsKey("spaceId")) {
      spaceId = resolveSpaceId(ctx.familyId(), body.get("spaceId"));
      spaceChanged = !Objects.equals(spaceId, before.spaceId());
    }
    if (body.containsKey("locationId")) {
      locationId = resolveLocationId(ctx.familyId(), spaceId, body.get("locationId"));
    } else if (spaceChanged) {
      locationId = null;
    }

    List<String> tagIds = before.tagIds();
    if (body.containsKey("tagIds")) {
      tagIds = resolveTagIds(ctx.familyId(), body.get("tagIds"), true);
    }

    Date productionDate = before.productionDate();
    if (body.containsKey("productionDate")) {
      String d = parseDate(body, "productionDate", true);
      productionDate = toSqlDate(d);
    }
    Date expireDate = before.expireDate();
    if (body.containsKey("expireDate")) {
      String d = parseDate(body, "expireDate", true);
      expireDate = toSqlDate(d);
    }

    List<String> images = before.imageFileIDs();
    if (body.containsKey("imageFileIDs") || body.containsKey("imageFileID")) {
      images = normalizeImages(body, false);
    }

    String source = body.containsKey("source") ? sourceOf(body.get("source")) : before.source();
    Timestamp now = TimeJson.nowTs();

    List<String> changed = new ArrayList<>();
    if (!Objects.equals(name, before.name())) {
      changed.add("name");
    }
    if (quantity.compareTo(before.quantity()) != 0) {
      changed.add("quantity");
    }
    if (!Objects.equals(unit, before.unit())) {
      changed.add("unit");
    }
    if (!Objects.equals(note, before.note())) {
      changed.add("note");
    }
    if (!Objects.equals(spaceId, before.spaceId())) {
      changed.add("spaceId");
    }
    if (!Objects.equals(locationId, before.locationId())) {
      changed.add("locationId");
    }
    if (!Objects.equals(tagIds, before.tagIds())) {
      changed.add("tagIds");
    }
    if (!Objects.equals(
        productionDate == null ? null : productionDate.toString(),
        before.productionDate() == null ? null : before.productionDate().toString())) {
      changed.add("productionDate");
    }
    if (!Objects.equals(
        expireDate == null ? null : expireDate.toString(),
        before.expireDate() == null ? null : before.expireDate().toString())) {
      changed.add("expireDate");
    }
    if (!Objects.equals(images, before.imageFileIDs())) {
      changed.add("imageFileIDs");
    }

    itemRepository.update(
        itemId,
        name,
        quantity,
        unit,
        note,
        spaceId,
        locationId,
        productionDate,
        expireDate,
        source,
        now);
    if (body.containsKey("tagIds")) {
      itemRepository.replaceTags(itemId, tagIds);
    }
    if (body.containsKey("imageFileIDs") || body.containsKey("imageFileID")) {
      itemRepository.replaceImages(itemId, images);
    }

    if (expireDate == null) {
      itemRepository.removeExpireSubsForItem(itemId);
    }
    Boolean want =
        body.containsKey("expireReminderEnabled")
            ? Boolean.TRUE.equals(body.get("expireReminderEnabled"))
            : null;
    boolean mine =
        syncExpireSub(
            ctx.familyId(),
            itemId,
            ctx.openid(),
            want,
            expireDate == null ? null : expireDate.toString());

    if (!changed.isEmpty()) {
      Map<String, String> place = snapshotPlace(ctx.familyId(), spaceId, locationId);
      activityWriteService.append(
          ctx.familyId(),
          itemId,
          "update",
          ctx.openid(),
          name,
          null,
          place.get("spaceId"),
          place.get("spaceName"),
          place.get("locationId"),
          place.get("locationName"),
          quantity,
          unit,
          changed,
          summarize(changed),
          source);
    }

    return toView(itemRepository.findById(itemId).orElseThrow(), mine);
  }

  @Transactional
  public Map<String, Object> remove(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    String itemId = str(body.get("itemId")).trim();
    ItemRow item = requireItemInFamily(itemId, ctx.familyId());
    String source =
        "agent".equals(body.get("source")) || "agent".equals(item.source()) ? "agent" : "ui";
    Map<String, String> place =
        snapshotPlace(ctx.familyId(), item.spaceId(), item.locationId());
    itemRepository.delete(itemId);
    itemRepository.removeExpireSubsForItem(itemId);
    familyRepository.bumpItemCount(ctx.familyId(), -1);
    activityWriteService.append(
        ctx.familyId(),
        itemId,
        "remove",
        ctx.openid(),
        item.name(),
        null,
        place.get("spaceId"),
        place.get("spaceName"),
        place.get("locationId"),
        place.get("locationName"),
        item.quantity(),
        item.unit(),
        null,
        null,
        source);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("itemId", itemId);
    return out;
  }

  @Transactional
  public Map<String, Object> removeMany(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    List<String> ids = parseIdList(body.get("itemIds"), "INVALID_IDS");
    if (ids.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "物资无效");
    }
    if (ids.size() > CREATE_MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_IDS, "一次最多删除 " + CREATE_MANY_LIMIT + " 件");
    }
    List<ItemRow> items = itemRepository.findByIds(ids);
    if (items.size() != ids.size()) {
      throw ApiException.of(ErrorCodes.NOT_FOUND, "部分物资不存在");
    }
    for (ItemRow item : items) {
      if (!ctx.familyId().equals(item.familyId())) {
        throw ApiException.of(ErrorCodes.FORBIDDEN, "无权操作该物资");
      }
    }
    String source = sourceOf(body.get("source"));
    for (ItemRow item : items) {
      itemRepository.delete(item.id());
      itemRepository.removeExpireSubsForItem(item.id());
    }
    familyRepository.bumpItemCount(ctx.familyId(), -items.size());
    if (items.size() == 1) {
      ItemRow item = items.get(0);
      Map<String, String> place =
          snapshotPlace(ctx.familyId(), item.spaceId(), item.locationId());
      activityWriteService.append(
          ctx.familyId(),
          item.id(),
          "remove",
          ctx.openid(),
          item.name(),
          null,
          place.get("spaceId"),
          place.get("spaceName"),
          place.get("locationId"),
          place.get("locationName"),
          item.quantity(),
          item.unit(),
          null,
          null,
          source);
    } else {
      String batchName =
          items.stream().map(ItemRow::name).reduce((a, b) -> a + "、" + b).orElse("");
      activityWriteService.append(
          ctx.familyId(),
          "",
          "remove_batch",
          ctx.openid(),
          batchName,
          items.size(),
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          source);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("removed", true);
    out.put("itemIds", ids);
    out.put("count", ids.size());
    return out;
  }

  @Transactional
  public Map<String, Object> merge(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    List<String> ids = parseIdList(body.get("itemIds"), "INVALID_MERGE");
    if (ids.size() < 2) {
      throw ApiException.of(ErrorCodes.INVALID_MERGE, "至少选择两件物资合并");
    }
    if (ids.size() > CREATE_MANY_LIMIT) {
      throw ApiException.of(ErrorCodes.INVALID_MERGE, "一次最多合并 " + CREATE_MANY_LIMIT + " 件");
    }
    List<ItemRow> items = itemRepository.findByIds(ids);
    Map<String, ItemRow> byId = new LinkedHashMap<>();
    for (ItemRow i : items) {
      byId.put(i.id(), i);
    }
    List<ItemRow> ordered = new ArrayList<>();
    for (String id : ids) {
      ItemRow item = byId.get(id);
      if (item == null) {
        throw ApiException.of(ErrorCodes.NOT_FOUND, "物资不存在");
      }
      if (!ctx.familyId().equals(item.familyId())) {
        throw ApiException.of(ErrorCodes.FORBIDDEN, "无权操作该物资");
      }
      ordered.add(item);
    }
    ItemRow keep = ordered.get(0);
    String spaceId = keep.spaceId();
    for (ItemRow i : ordered) {
      if (!Objects.equals(spaceId, i.spaceId())) {
        throw ApiException.of(ErrorCodes.INVALID_MERGE, "不能合并不同空间的物资");
      }
    }
    String unit = keep.unit() == null ? "" : keep.unit();
    for (ItemRow i : ordered) {
      String u = i.unit() == null ? "" : i.unit();
      if (!unit.isEmpty() && !u.isEmpty() && !unit.equals(u)) {
        throw ApiException.of(ErrorCodes.INVALID_MERGE, "单位不一致，无法合并");
      }
      if (unit.isEmpty()) {
        unit = u;
      }
    }
    String name =
        body.containsKey("name") ? str(body.get("name")).trim() : keep.name();
    if (name.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_NAME, "请输入物资名称");
    }
    BigDecimal qty = BigDecimal.ZERO;
    Set<String> tags = new LinkedHashSet<>();
    String earliestProd = null;
    String earliestExp = null;
    List<String> notes = new ArrayList<>();
    String locationId = keep.locationId();
    boolean anySub = false;
    for (ItemRow i : ordered) {
      qty = qty.add(i.quantity() == null ? BigDecimal.ZERO : i.quantity());
      if (i.tagIds() != null) {
        tags.addAll(i.tagIds());
      }
      if (i.productionDate() != null) {
        String d = i.productionDate().toString();
        if (earliestProd == null || d.compareTo(earliestProd) < 0) {
          earliestProd = d;
        }
      }
      if (i.expireDate() != null) {
        String d = i.expireDate().toString();
        if (earliestExp == null || d.compareTo(earliestExp) < 0) {
          earliestExp = d;
        }
      }
      if (i.note() != null && !i.note().isBlank()) {
        notes.add(i.note().trim());
      }
      if (locationId == null && i.locationId() != null) {
        locationId = i.locationId();
      }
      if (itemRepository.anyExpireSub(i.id())) {
        anySub = true;
      }
    }
    String source = sourceOf(body.get("source"));
    Timestamp now = TimeJson.nowTs();
    List<String> absorbed = new ArrayList<>();
    for (int i = 1; i < ordered.size(); i++) {
      ItemRow abs = ordered.get(i);
      absorbed.add(abs.id());
      itemRepository.delete(abs.id());
      itemRepository.removeExpireSubsForItem(abs.id());
      activityWriteService.append(
          ctx.familyId(),
          abs.id(),
          "remove",
          ctx.openid(),
          abs.name(),
          null,
          null,
          null,
          null,
          null,
          abs.quantity(),
          abs.unit(),
          null,
          "合并入「" + name + "」",
          source);
    }
    familyRepository.bumpItemCount(ctx.familyId(), -absorbed.size());

    String note = String.join("；", notes);
    itemRepository.update(
        keep.id(),
        name,
        qty,
        unit,
        note,
        spaceId,
        locationId,
        toSqlDate(earliestProd),
        toSqlDate(earliestExp),
        source,
        now);
    itemRepository.replaceTags(keep.id(), new ArrayList<>(tags));

    if (earliestExp == null) {
      itemRepository.removeExpireSubsForItem(keep.id());
    } else if (anySub) {
      itemRepository.upsertExpireSub(ctx.familyId(), keep.id(), ctx.openid());
    }
    boolean mine = itemRepository.hasExpireSub(keep.id(), ctx.openid());

    Map<String, String> place = snapshotPlace(ctx.familyId(), spaceId, locationId);
    activityWriteService.append(
        ctx.familyId(),
        keep.id(),
        "update",
        ctx.openid(),
        name,
        null,
        place.get("spaceId"),
        place.get("spaceName"),
        place.get("locationId"),
        place.get("locationName"),
        qty,
        unit,
        List.of("quantity", "name"),
        "合并了 " + absorbed.size() + " 条",
        source);

    Map<String, Object> view = toView(itemRepository.findById(keep.id()).orElseThrow(), mine);
    view.put("mergedCount", absorbed.size() + 1);
    view.put("absorbedIds", absorbed);
    return view;
  }

  /**
   * 首页/临期列表的窗口 = 今天 + 家庭配置的提前天数，与订阅推送时间线保持一致。
   * 推送与首页参考同一档，避免「已提醒但首页看不到」。
   */
  private int expireWindowDays(String familyId) {
    return familyRepository
        .findById(familyId)
        .map(FamilyRow::expireReminderDays)
        .orElse(3);
  }

  /** 家庭临期提醒总开关；关掉时个人订阅仍然存在，只是不会推送。 */
  private boolean familyReminderEnabled(String familyId) {
    return familyRepository
        .findById(familyId)
        .map(FamilyRow::expireReminderEnabled)
        .orElse(true);
  }

  public Map<String, Object> get(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    ItemRow item = requireItemInFamily(str(body.get("itemId")).trim(), ctx.familyId());
    boolean mine = itemRepository.hasExpireSub(item.id(), ctx.openid());
    Map<String, Object> view = toView(item, mine);
    view.put("familyReminderEnabled", familyReminderEnabled(ctx.familyId()));
    return view;
  }

  public Map<String, Object> detail(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    ItemRow item = requireItemInFamily(str(body.get("itemId")).trim(), ctx.familyId());
    int actLimit = 10;
    if (body.get("activityLimit") != null) {
      try {
        actLimit = Integer.parseInt(String.valueOf(body.get("activityLimit")));
      } catch (NumberFormatException ignored) {
      }
      actLimit = Math.min(Math.max(actLimit, 1), 10);
    }
    boolean mine = itemRepository.hasExpireSub(item.id(), ctx.openid());
    Map<String, String> place =
        snapshotPlace(ctx.familyId(), item.spaceId(), item.locationId());
    List<Map<String, Object>> recent =
        activityRepository.listRecentForItem(item.id(), actLimit);
    // parse changedFields JSON strings into lists for client friendliness
    for (Map<String, Object> op : recent) {
      Object cf = op.get("changedFields");
      if (cf instanceof String s && s != null && s.startsWith("[")) {
        try {
          op.put("changedFields", new com.fasterxml.jackson.databind.ObjectMapper().readValue(s, List.class));
        } catch (Exception ignored) {
        }
      }
    }
    Map<String, Object> view = toView(item, mine);
    view.put("familyReminderEnabled", familyReminderEnabled(ctx.familyId()));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("item", view);
    out.put("spaceName", place.get("spaceName"));
    out.put("locationName", place.get("locationName"));
    out.put("tagNames", structureRepository.tagNames(ctx.familyId(), item.tagIds()));
    out.put("recentOps", recent);
    return out;
  }

  public Map<String, Object> editForm(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    // seed tags/default space like cloud
    familySeedService.seedStructureTree(ctx.familyId());
    String preferredSpace =
        body.get("spaceId") == null ? "" : str(body.get("spaceId")).trim();
    String spaceId =
        preferredSpace.isEmpty()
            ? structureRepository.ensureDefaultSpaceId(ctx.familyId())
            : resolveSpaceId(ctx.familyId(), preferredSpace);

    ItemRow item = null;
    String itemId = str(body.get("itemId")).trim();
    if (!itemId.isEmpty()) {
      item = requireItemInFamily(itemId, ctx.familyId());
      spaceId = item.spaceId();
    }

    List<Map<String, Object>> spaces = new ArrayList<>();
    for (var s : structureRepository.listSpaces(ctx.familyId())) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("_id", s.id());
      m.put("name", s.name());
      m.put("isDefault", s.isDefault());
      spaces.add(m);
    }
    List<Map<String, Object>> tags = new ArrayList<>();
    for (var t : structureRepository.listTags(ctx.familyId())) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("_id", t.id());
      m.put("name", t.name());
      tags.add(m);
    }
    List<Map<String, Object>> locations = new ArrayList<>();
    for (var l : structureRepository.listLocationsBySpace(ctx.familyId(), spaceId)) {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("_id", l.id());
      m.put("spaceId", l.spaceId());
      m.put("name", l.name());
      locations.add(m);
    }

    Map<String, Object> out = new LinkedHashMap<>();
    if (item == null) {
      out.put("item", null);
      out.put("spaceId", spaceId);
      out.put("locationId", null);
    } else {
      boolean mine =
          item.expireDate() != null && itemRepository.hasExpireSub(item.id(), ctx.openid());
      out.put("item", toView(item, mine));
      out.put("spaceId", item.spaceId());
      out.put("locationId", item.locationId());
    }
    out.put("spaces", spaces);
    out.put("tags", tags);
    out.put("locations", locations);
    return out;
  }

  public Map<String, Object> list(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    int limit = clamp(body.get("limit"), 100, 1, 100);
    String spaceId = str(body.get("spaceId")).trim();
    String tagId = str(body.get("tagId")).trim();
    Set<String> subs = itemRepository.subscribedItemIds(ctx.familyId(), ctx.openid());
    List<Map<String, Object>> list = new ArrayList<>();
    for (ItemRow item :
        itemRepository.list(
            ctx.familyId(),
            spaceId.isEmpty() ? null : spaceId,
            tagId.isEmpty() ? null : tagId,
            limit)) {
      list.add(toView(item, subs.contains(item.id())));
    }
    return Map.of("list", list);
  }

  public Map<String, Object> count() {
    FamilyCtx ctx = requireFamily();
    return Map.of("total", itemRepository.countByFamily(ctx.familyId()));
  }

  public Map<String, Object> search(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    String keyword = str(body.get("keyword")).trim();
    int limit = clamp(body.get("limit"), 20, 1, 50);
    if (keyword.isEmpty()) {
      Map<String, Object> proxied = new LinkedHashMap<>(body);
      proxied.put("limit", limit);
      return list(proxied);
    }
    String spaceId = str(body.get("spaceId")).trim();
    String tagId = str(body.get("tagId")).trim();
    Set<String> subs = itemRepository.subscribedItemIds(ctx.familyId(), ctx.openid());
    List<Map<String, Object>> list = new ArrayList<>();
    // 关键字交给数据库过滤（ILIKE）后再 LIMIT，避免「先取 100 行、再内存过滤」把新物资漏掉
    for (ItemRow item :
        itemRepository.search(
            ctx.familyId(),
            spaceId.isEmpty() ? null : spaceId,
            tagId.isEmpty() ? null : tagId,
            keyword,
            limit)) {
      list.add(toView(item, subs.contains(item.id())));
    }
    return Map.of("list", list);
  }

  public Map<String, Object> listExpiring(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    int limit = clamp(body.get("limit"), 50, 1, 100);
    String today = ShanghaiDates.todayYmd();
    String end = ShanghaiDates.addDaysYmd(today, expireWindowDays(ctx.familyId()));
    Set<String> subs = itemRepository.subscribedItemIds(ctx.familyId(), ctx.openid());
    List<ItemRow> rows = itemRepository.listExpiring(ctx.familyId(), end, limit);
    List<Map<String, Object>> list = attachPlaces(ctx.familyId(), rows, subs);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("list", list);
    out.put("today", today);
    out.put("windowEnd", end);
    return out;
  }

  public Map<String, Object> home(Map<String, Object> body) {
    FamilyCtx ctx = requireFamily();
    // 上限 600：排序为「临期优先 + created_at 正序」，若截断会丢最新添加的物品。
    // 免费档 50 件、加强版实测也极少过 500；再高收益低而 setData 体积见涨，超 600 件再上分页。
    int limit = clamp(body.get("limit"), 100, 1, 600);
    String spaceId = str(body.get("spaceId")).trim();
    String today = ShanghaiDates.todayYmd();
    String end = ShanghaiDates.addDaysYmd(today, expireWindowDays(ctx.familyId()));
    Set<String> subs = itemRepository.subscribedItemIds(ctx.familyId(), ctx.openid());

    List<ItemRow> listRows =
        itemRepository.list(
            ctx.familyId(), spaceId.isEmpty() ? null : spaceId, null, limit);
    List<Map<String, Object>> list = new ArrayList<>();
    for (ItemRow item : listRows) {
      list.add(toView(item, subs.contains(item.id())));
    }
    int total = itemRepository.countByFamily(ctx.familyId());
    List<ItemRow> topRows = itemRepository.listExpiring(ctx.familyId(), end, 1);
    Map<String, Object> expiringTop = null;
    if (!topRows.isEmpty()) {
      expiringTop = attachPlaces(ctx.familyId(), topRows, subs).get(0);
    }
    int expiringCount = itemRepository.countExpiring(ctx.familyId(), end);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("list", list);
    out.put("total", total);
    out.put("expiringTop", expiringTop);
    out.put("expiringCount", expiringCount);
    out.put("today", today);
    out.put("windowEnd", end);
    return out;
  }

  private List<Map<String, Object>> attachPlaces(
      String familyId, List<ItemRow> rows, Set<String> subs) {
    List<String> spaceIds =
        rows.stream().map(ItemRow::spaceId).filter(Objects::nonNull).distinct().toList();
    List<String> locationIds =
        rows.stream().map(ItemRow::locationId).filter(Objects::nonNull).distinct().toList();
    Map<String, String> spaceNames = structureRepository.spaceNames(familyId, spaceIds);
    Map<String, String> locNames = structureRepository.locationNames(familyId, locationIds);
    List<Map<String, Object>> list = new ArrayList<>();
    for (ItemRow item : rows) {
      Map<String, Object> view = toView(item, subs.contains(item.id()));
      view.put("spaceName", spaceNames.getOrDefault(item.spaceId(), ""));
      view.put(
          "locationName",
          item.locationId() == null ? "" : locNames.getOrDefault(item.locationId(), ""));
      list.add(view);
    }
    return list;
  }

  private static String parseDate(Map<String, Object> body, String key, boolean presentIfMissingIsSkip) {
    boolean present = body.containsKey(key);
    if (!present) {
      if (presentIfMissingIsSkip) {
        // shouldn't call with false present - use for required presence when key in body
      }
      return null; // create path: missing → null date
    }
    String v = ShanghaiDates.normalizeDateInput(body.get(key), true);
    if ("__invalid__".equals(v)) {
      throw ApiException.of(
          ErrorCodes.INVALID_DATE, key.contains("production") ? "生产日期无效" : "过期日期无效");
    }
    return v; // may be null (clear)
  }

  private static List<String> parseIdList(Object raw, String code) {
    if (!(raw instanceof List<?> list)) {
      throw ApiException.of(code, "物资无效");
    }
    List<String> ids = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    for (Object o : list) {
      String id = o == null ? "" : String.valueOf(o).trim();
      if (id.isEmpty() || !seen.add(id)) {
        continue;
      }
      ids.add(id);
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

  private static String summarize(List<String> changed) {
    Map<String, String> labels = new LinkedHashMap<>();
    labels.put("name", "名称");
    labels.put("quantity", "数量");
    labels.put("unit", "单位");
    labels.put("note", "备注");
    labels.put("spaceId", "空间");
    labels.put("locationId", "位置");
    labels.put("tagIds", "标签");
    labels.put("productionDate", "生产日");
    labels.put("expireDate", "过期日");
    labels.put("imageFileIDs", "图片");
    List<String> parts = new ArrayList<>();
    for (String c : changed) {
      if (labels.containsKey(c)) {
        parts.add(labels.get(c));
      }
    }
    return String.join("、", parts);
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
