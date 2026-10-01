package com.homestocker.modules.family.app;

import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.StructureRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class FamilySeedService {

  private static final List<String> DEFAULT_TAGS = List.of("药品", "饮料", "工具", "衣物");

  private final StructureRepository structureRepository;
  private final FamilyRepository familyRepository;
  private final FamilyTreeService familyTreeService;

  public FamilySeedService(
      StructureRepository structureRepository,
      FamilyRepository familyRepository,
      FamilyTreeService familyTreeService) {
    this.structureRepository = structureRepository;
    this.familyRepository = familyRepository;
    this.familyTreeService = familyTreeService;
  }

  /** Default warehouse + default tags + family_trees. Idempotent-ish. */
  public void seedStructureTree(String familyId) {
    var now = TimeJson.nowTs();
    if (structureRepository.countSpaces(familyId) == 0) {
      structureRepository.insertDefaultSpace(UUID.randomUUID().toString(), familyId, now);
    }

    var family = familyRepository.findById(familyId).orElse(null);
    if (family != null && family.tagsSeededAt() == null) {
      if (structureRepository.countTags(familyId) == 0) {
        long base = now.getTime();
        for (int i = 0; i < DEFAULT_TAGS.size(); i++) {
          structureRepository.insertDefaultTag(
              UUID.randomUUID().toString(),
              familyId,
              DEFAULT_TAGS.get(i),
              new java.sql.Timestamp(base + i));
        }
      }
      familyRepository.updateTagsSeededAt(familyId, now);
    }

    familyTreeService.rebuild(familyId);
  }
}
