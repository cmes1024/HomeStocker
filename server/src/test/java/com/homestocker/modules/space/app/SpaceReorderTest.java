package com.homestocker.modules.space.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.auth.AuthPrincipal;
import com.homestocker.auth.RequestContext;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.infra.jdbc.MembershipRepository;
import com.homestocker.infra.jdbc.StructureRepository;
import com.homestocker.infra.jdbc.StructureRepository.SpaceRow;
import com.homestocker.infra.jdbc.UserRepository;
import com.homestocker.infra.jdbc.UserRow;
import com.homestocker.modules.family.app.FamilyTreeService;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** No Mockito（inline mock maker 在 Docker/Temurin 下易挂），沿用 fake 子类约定。 */
class SpaceReorderTest {

  private static final String OPENID = "o1";
  private static final String FAMILY = "f1";

  @BeforeEach
  void setUp() {
    RequestContext.set(new AuthPrincipal(OPENID, "t1"));
  }

  @AfterEach
  void tearDown() {
    RequestContext.clear();
  }

  static final class FakeUserRepository extends UserRepository {
    FakeUserRepository() {
      super(null);
    }

    @Override
    public UserRow ensureUser(String openid) {
      return new UserRow(openid, FAMILY, "", "");
    }
  }

  static final class FakeMembershipRepository extends MembershipRepository {
    FakeMembershipRepository() {
      super(null);
    }

    @Override
    public boolean exists(String openid, String familyId) {
      return true;
    }
  }

  static final class FakeItemRepository extends ItemRepository {
    FakeItemRepository() {
      super(null);
    }
  }

  /** 内存维护「数据库顺序」：listSpaceRows 按内部顺序返回，renumberSpaces 按提交顺序重排。 */
  static final class FakeStructureRepository extends StructureRepository {
    final List<SpaceRow> rows = new ArrayList<>();
    final List<List<String>> renumberCalls = new ArrayList<>();

    FakeStructureRepository() {
      super(null);
    }

    void seed(String... ids) {
      rows.clear();
      long now = 1_700_000_000_000L;
      for (String id : ids) {
        rows.add(
            new SpaceRow(
                id,
                FAMILY,
                id,
                null,
                false,
                "default-indoor",
                "",
                new Timestamp(now),
                new Timestamp(now)));
        now += 60_000;
      }
    }

    List<String> ids() {
      return rows.stream().map(SpaceRow::id).toList();
    }

    @Override
    public List<SpaceRow> listSpaceRows(String familyId) {
      return List.copyOf(rows);
    }

    @Override
    public void renumberSpaces(String familyId, List<String> orderedIds) {
      renumberCalls.add(List.copyOf(orderedIds));
      List<SpaceRow> byId = new ArrayList<>();
      for (String id : orderedIds) {
        Optional<SpaceRow> hit = rows.stream().filter(r -> r.id().equals(id)).findFirst();
        hit.ifPresent(byId::add);
      }
      rows.clear();
      rows.addAll(byId);
    }
  }

  static final class FakeFamilyTreeService extends FamilyTreeService {
    final AtomicInteger rebuilds = new AtomicInteger();

    FakeFamilyTreeService(StructureRepository repo) {
      super(repo, new ObjectMapper());
    }

    @Override
    public Map<String, Object> rebuild(String familyId) {
      rebuilds.incrementAndGet();
      return null;
    }
  }

  private SpaceReorderTestContext ctx() {
    FakeStructureRepository structure = new FakeStructureRepository();
    FakeFamilyTreeService tree = new FakeFamilyTreeService(structure);
    SpaceService svc =
        new SpaceService(
            new FakeUserRepository(),
            new FakeMembershipRepository(),
            structure,
            new FakeItemRepository(),
            tree);
    return new SpaceReorderTestContext(svc, structure, tree);
  }

  record SpaceReorderTestContext(
      SpaceService svc, FakeStructureRepository structure, FakeFamilyTreeService tree) {}

  @Test
  void renumbersInSubmittedOrderAndRebuildsTree() {
    SpaceReorderTestContext c = ctx();
    c.structure().seed("s1", "s2", "s3");

    Map<String, Object> out = c.svc().reorder(Map.of("spaceIds", List.of("s3", "s1", "s2")));

    assertEquals(List.of(List.of("s3", "s1", "s2")), c.structure().renumberCalls);
    assertEquals(List.of("s3", "s1", "s2"), c.structure().ids());
    assertEquals(1, c.tree().rebuilds.get());
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("list");
    assertEquals(List.of("s3", "s1", "s2"), list.stream().map(m -> m.get("_id")).toList());
  }

  @Test
  void rejectsUnknownId() {
    SpaceReorderTestContext c = ctx();
    c.structure().seed("s1", "s2", "s3");

    ApiException e =
        assertThrows(
            ApiException.class,
            () -> c.svc().reorder(Map.of("spaceIds", List.of("s1", "s2", "sx"))));
    assertEquals(ErrorCodes.NOT_FOUND, e.getCode());
    assertTrue(c.structure().renumberCalls.isEmpty());
  }

  @Test
  void rejectsPartialList() {
    SpaceReorderTestContext c = ctx();
    c.structure().seed("s1", "s2", "s3");

    ApiException e =
        assertThrows(
            ApiException.class, () -> c.svc().reorder(Map.of("spaceIds", List.of("s1"))));
    assertEquals(ErrorCodes.INVALID_IDS, e.getCode());
    assertTrue(c.structure().renumberCalls.isEmpty());
  }

  @Test
  void rejectsDuplicateIds() {
    SpaceReorderTestContext c = ctx();
    c.structure().seed("s1", "s2", "s3");

    ApiException e =
        assertThrows(
            ApiException.class,
            () -> c.svc().reorder(Map.of("spaceIds", List.of("s1", "s1", "s2"))));
    assertEquals(ErrorCodes.INVALID_IDS, e.getCode());
    assertTrue(c.structure().renumberCalls.isEmpty());
  }

  @Test
  void rejectsEmptyIds() {
    SpaceReorderTestContext c = ctx();
    c.structure().seed("s1");

    ApiException e = assertThrows(ApiException.class, () -> c.svc().reorder(Map.of()));
    assertEquals(ErrorCodes.INVALID_IDS, e.getCode());
  }
}
