package com.homestocker.modules.ai.habits;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.FamilyAiHabitRepository;
import java.sql.Timestamp;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** No Mockito — Docker/Temurin agent attach often breaks inline mock maker. */
class FamilyHabitServiceTest {

  static final class FakeRepo extends FamilyAiHabitRepository {
    final AtomicReference<String> store = new AtomicReference<>("[]");

    FakeRepo() {
      super(null);
    }

    @Override
    public Optional<String> findHabitsJson(String familyId) {
      return Optional.ofNullable(store.get());
    }

    @Override
    public void upsertHabitsJson(String familyId, String habitsJson, Timestamp updatedAt) {
      store.set(habitsJson);
    }
  }

  @Test
  void upsertOverwriteAndRejectInvalid() {
    FakeRepo repo = new FakeRepo();
    FamilyHabitService svc = new FamilyHabitService(repo, new ObjectMapper());

    for (String slot : HabitSlots.all()) {
      svc.upsert("f1", slot, "v-" + slot);
    }
    assertEquals(7, svc.list("f1").size());

    svc.upsert("f1", HabitSlots.DEFAULT_SPACE, "厨房");
    assertEquals(7, svc.list("f1").size());
    assertTrue(svc.renderForPrompt("f1").contains("厨房"));

    ApiException bad = assertThrows(ApiException.class, () -> svc.upsert("f1", "nope", "x"));
    assertEquals(ErrorCodes.INVALID_HABIT, bad.getCode());

    ApiException empty =
        assertThrows(ApiException.class, () -> svc.upsert("f1", HabitSlots.TONE, "  "));
    assertEquals(ErrorCodes.INVALID_HABIT, empty.getCode());

    svc.remove("f1", HabitSlots.FOCUS);
    assertEquals(6, svc.list("f1").size());
  }

  @Test
  void emptyRendersAsNone() {
    FakeRepo repo = new FakeRepo();
    repo.store.set(null);
    FamilyHabitService svc = new FamilyHabitService(repo, new ObjectMapper());
    assertEquals("无", svc.renderForPrompt("f2"));
  }

  @Test
  void renderAnnotatesNonSpaceDefault() {
    FakeRepo repo = new FakeRepo();
    FamilyHabitService svc = new FamilyHabitService(repo, new ObjectMapper());
    svc.upsert("f1", HabitSlots.DEFAULT_SPACE, "没说放哪儿就放客厅；饮料放冰箱");
    Map<String, Object> tree =
        Map.of("spaces", List.of(Map.of("id", "s1", "name", "客厅")));
    String rendered = svc.renderForPrompt("f1", tree);
    assertTrue(rendered.contains("非纯空间名"));
  }
}
