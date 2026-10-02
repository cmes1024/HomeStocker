package com.homestocker.infra.jdbc;

import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FamilyAiHabitRepository {

  private final JdbcTemplate jdbc;

  public FamilyAiHabitRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<String> findHabitsJson(String familyId) {
    var list =
        jdbc.query(
            "SELECT habits_json::text FROM family_ai_habits WHERE family_id = ?",
            (rs, i) -> rs.getString(1),
            familyId);
    return list.stream().findFirst();
  }

  public void upsertHabitsJson(String familyId, String habitsJson, Timestamp updatedAt) {
    jdbc.update(
        """
        INSERT INTO family_ai_habits (family_id, habits_json, updated_at)
        VALUES (?, CAST(? AS jsonb), ?)
        ON CONFLICT (family_id) DO UPDATE SET
          habits_json = EXCLUDED.habits_json,
          updated_at = EXCLUDED.updated_at
        """,
        familyId,
        habitsJson,
        updatedAt);
  }

  public void delete(String familyId) {
    jdbc.update("DELETE FROM family_ai_habits WHERE family_id = ?", familyId);
  }
}
