package com.homestocker.modules.family.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.infra.jdbc.StructureRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class FamilyTreeService {

  private static final Logger log = LoggerFactory.getLogger(FamilyTreeService.class);

  private final StructureRepository structureRepository;
  private final ObjectMapper objectMapper;

  public FamilyTreeService(StructureRepository structureRepository, ObjectMapper objectMapper) {
    this.structureRepository = structureRepository;
    this.objectMapper = objectMapper;
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> getOrRebuild(String familyId) {
    if (familyId == null || familyId.isBlank()) {
      return emptyTree(familyId);
    }
    Optional<String> json = structureRepository.findFamilyTreeJson(familyId);
    if (json.isPresent() && !json.get().isBlank()) {
      try {
        Map<String, Object> doc =
            objectMapper.readValue(json.get(), new TypeReference<>() {});
        if (isUsableTree(doc)) {
          doc.putIfAbsent("familyId", familyId);
          return doc;
        }
      } catch (Exception e) {
        log.warn("familyTree parse failed familyId={}", familyId, e);
      }
    }
    Map<String, Object> rebuilt = rebuild(familyId);
    return rebuilt != null ? rebuilt : emptyTree(familyId);
  }

  public static boolean isUsableTree(Map<String, Object> doc) {
    return doc != null && doc.get("spaces") instanceof List<?> && doc.get("tags") instanceof List<?>;
  }

  private static Map<String, Object> emptyTree(String familyId) {
    Map<String, Object> tree = new LinkedHashMap<>();
    tree.put("familyId", familyId);
    tree.put("spaces", new ArrayList<>());
    tree.put("tags", new ArrayList<>());
    return tree;
  }

  public static String renderTreeNames(Map<String, Object> tree) {
    List<String> lines = new ArrayList<>();
    List<Map<String, Object>> spaces = spacesOf(tree);
    if (spaces.isEmpty()) {
      lines.add("- （无空间）");
    } else {
      for (Map<String, Object> space : spaces) {
        boolean isDefault = Boolean.TRUE.equals(space.get("isDefault"));
        String name = str(space.get("name"));
        lines.add("- " + (isDefault ? name + "（默认）" : name));
        List<Map<String, Object>> locs = locationsOf(space);
        if (locs.isEmpty()) {
          lines.add("  - （无位置）");
        } else {
          for (Map<String, Object> loc : locs) {
            lines.add("  - " + str(loc.get("name")));
          }
        }
      }
    }
    List<String> tagNames = new ArrayList<>();
    for (Map<String, Object> t : tagsOf(tree)) {
      String n = str(t.get("name"));
      if (!n.isEmpty()) {
        tagNames.add(n);
      }
    }
    lines.add("");
    lines.add("标签：" + (tagNames.isEmpty() ? "（无）" : String.join("、", tagNames)));
    return String.join("\n", lines);
  }

  public static void markTreeDirty(com.homestocker.modules.ai.tools.ToolContext ctx) {
    if (ctx != null) {
      ctx.treeDirty = true;
    }
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> patchSpaceIntoTree(Map<String, Object> tree, Map<String, Object> spaceDoc) {
    if (tree == null || spaceDoc == null) {
      return tree;
    }
    String id = str(spaceDoc.get("_id"));
    if (id.isEmpty()) {
      id = str(spaceDoc.get("id"));
    }
    if (id.isEmpty()) {
      return tree;
    }
    List<Map<String, Object>> spaces = spacesOf(tree);
    for (Map<String, Object> s : spaces) {
      if (id.equals(str(s.get("id")))) {
        return tree;
      }
    }
    Map<String, Object> node = new LinkedHashMap<>();
    node.put("id", id);
    node.put("name", str(spaceDoc.get("name")));
    node.put("isDefault", Boolean.TRUE.equals(spaceDoc.get("isDefault")));
    node.put("locations", new ArrayList<>());
    spaces.add(node);
    tree.put("spaces", spaces);
    return tree;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> patchLocationIntoTree(
      Map<String, Object> tree, String spaceId, Map<String, Object> locDoc) {
    if (tree == null || spaceId == null || locDoc == null) {
      return tree;
    }
    String locId = str(locDoc.get("_id"));
    if (locId.isEmpty()) {
      locId = str(locDoc.get("id"));
    }
    if (locId.isEmpty()) {
      return tree;
    }
    for (Map<String, Object> space : spacesOf(tree)) {
      if (!spaceId.equals(str(space.get("id")))) {
        continue;
      }
      List<Map<String, Object>> locs = locationsOf(space);
      for (Map<String, Object> l : locs) {
        if (locId.equals(str(l.get("id")))) {
          return tree;
        }
      }
      Map<String, Object> loc = new LinkedHashMap<>();
      loc.put("id", locId);
      loc.put("name", str(locDoc.get("name")));
      locs.add(loc);
      space.put("locations", locs);
      break;
    }
    return tree;
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> patchTagIntoTree(Map<String, Object> tree, Map<String, Object> tagDoc) {
    if (tree == null || tagDoc == null) {
      return tree;
    }
    String id = str(tagDoc.get("_id"));
    if (id.isEmpty()) {
      id = str(tagDoc.get("id"));
    }
    if (id.isEmpty()) {
      return tree;
    }
    List<Map<String, Object>> tags = tagsOf(tree);
    for (Map<String, Object> t : tags) {
      if (id.equals(str(t.get("id")))) {
        return tree;
      }
    }
    Map<String, Object> node = new LinkedHashMap<>();
    node.put("id", id);
    node.put("name", str(tagDoc.get("name")));
    tags.add(node);
    tree.put("tags", tags);
    return tree;
  }

  public Map<String, Object> flushFamilyTreeIfDirty(com.homestocker.modules.ai.tools.ToolContext ctx) {
    if (ctx == null || !ctx.treeDirty) {
      return ctx != null ? ctx.tree : null;
    }
    Map<String, Object> tree = rebuild(ctx.familyId);
    if (tree != null) {
      ctx.tree = tree;
    }
    ctx.treeDirty = false;
    return ctx.tree;
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> spacesOf(Map<String, Object> tree) {
    Object raw = tree != null ? tree.get("spaces") : null;
    if (raw instanceof List<?> list) {
      List<Map<String, Object>> out = new ArrayList<>();
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          out.add((Map<String, Object>) m);
        }
      }
      return out;
    }
    return new ArrayList<>();
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> tagsOf(Map<String, Object> tree) {
    Object raw = tree != null ? tree.get("tags") : null;
    if (raw instanceof List<?> list) {
      List<Map<String, Object>> out = new ArrayList<>();
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          out.add((Map<String, Object>) m);
        }
      }
      return out;
    }
    return new ArrayList<>();
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> locationsOf(Map<String, Object> space) {
    Object raw = space != null ? space.get("locations") : null;
    if (raw instanceof List<?> list) {
      List<Map<String, Object>> out = new ArrayList<>();
      for (Object o : list) {
        if (o instanceof Map<?, ?> m) {
          out.add((Map<String, Object>) m);
        }
      }
      return out;
    }
    return new ArrayList<>();
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }

  public Map<String, Object> rebuild(String familyId) {
    if (familyId == null || familyId.isBlank()) {
      return null;
    }
    try {
      var spaces = structureRepository.listSpaces(familyId);
      var locations = structureRepository.listLocations(familyId);
      var tags = structureRepository.listTags(familyId);

      Map<String, List<Map<String, Object>>> locBySpace = new LinkedHashMap<>();
      for (var loc : locations) {
        locBySpace
            .computeIfAbsent(loc.spaceId(), k -> new ArrayList<>())
            .add(Map.of("id", loc.id(), "name", loc.name() == null ? "" : loc.name()));
      }

      long now = System.currentTimeMillis();
      List<Map<String, Object>> spaceNodes = new ArrayList<>();
      for (var s : spaces) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", s.id());
        node.put("name", s.name() == null ? "" : s.name());
        node.put("isDefault", s.isDefault());
        node.put("locations", locBySpace.getOrDefault(s.id(), List.of()));
        spaceNodes.add(node);
      }
      List<Map<String, Object>> tagNodes = new ArrayList<>();
      for (var t : tags) {
        tagNodes.add(Map.of("id", t.id(), "name", t.name() == null ? "" : t.name()));
      }

      Map<String, Object> tree = new LinkedHashMap<>();
      tree.put("familyId", familyId);
      tree.put("rev", now);
      tree.put("spaces", spaceNodes);
      tree.put("tags", tagNodes);
      tree.put("updatedAt", now);

      structureRepository.upsertFamilyTree(familyId, now, objectMapper.writeValueAsString(tree));
      return tree;
    } catch (Exception e) {
      log.warn("familyTree rebuild failed familyId={}", familyId, e);
      return null;
    }
  }

  public void delete(String familyId) {
    structureRepository.deleteFamilyTree(familyId);
  }
}
