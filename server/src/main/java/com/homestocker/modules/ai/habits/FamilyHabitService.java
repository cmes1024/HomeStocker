package com.homestocker.modules.ai.habits;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.homestocker.common.ApiException;
import com.homestocker.common.ErrorCodes;
import com.homestocker.infra.jdbc.FamilyAiHabitRepository;
import com.homestocker.modules.ai.agent.TreeMatch;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class FamilyHabitService {

  private final FamilyAiHabitRepository repository;
  private final ObjectMapper objectMapper;

  public FamilyHabitService(FamilyAiHabitRepository repository, ObjectMapper objectMapper) {
    this.repository = repository;
    this.objectMapper = objectMapper;
  }

  public List<FamilyHabit> list(String familyId) {
    return load(familyId);
  }

  public String renderForPrompt(String familyId) {
    return renderForPrompt(familyId, null);
  }

  public String renderForPrompt(String familyId, Map<String, Object> tree) {
    List<FamilyHabit> habits = load(familyId);
    if (habits.isEmpty()) {
      return "无";
    }
    StringBuilder sb = new StringBuilder();
    for (FamilyHabit h : habits) {
      if (sb.length() > 0) {
        sb.append('\n');
      }
      sb.append("- ")
          .append(HabitSlots.label(h.slot()))
          .append("(")
          .append(h.slot())
          .append(")：")
          .append(h.text());
      if (HabitSlots.DEFAULT_SPACE.equals(h.slot())
          && tree != null
          && TreeMatch.exactSpaceName(tree, h.text()) == null) {
        sb.append("（非纯空间名，记一笔时勿直接当 spaceName；应拆成空间名 + 其它槽重记）");
      }
    }
    return sb.toString();
  }

  public List<FamilyHabit> upsert(String familyId, String slotRaw, String textRaw) {
    String slot = slotRaw == null ? "" : slotRaw.trim();
    String text = textRaw == null ? "" : textRaw.trim();
    if (!HabitSlots.isKnown(slot)) {
      throw ApiException.of(ErrorCodes.INVALID_HABIT, "这类习惯我还不支持记，换个说法试试？");
    }
    if (text.isEmpty()) {
      throw ApiException.of(ErrorCodes.INVALID_HABIT, "习惯内容不能为空，再说具体一点？");
    }
    if (text.length() > HabitSlots.MAX_TEXT_LEN) {
      throw ApiException.of(
          ErrorCodes.INVALID_HABIT, "这条习惯有点长，精简到 " + HabitSlots.MAX_TEXT_LEN + " 字以内再记");
    }

    List<FamilyHabit> current = new ArrayList<>(load(familyId));
    int idx = indexOfSlot(current, slot);
    if (idx >= 0) {
      current.set(idx, new FamilyHabit(slot, text));
    } else {
      if (current.size() >= HabitSlots.MAX_FAMILY_HABITS) {
        throw ApiException.of(
            ErrorCodes.HABIT_LIMIT_REACHED,
            "家里习惯已经记满 "
                + HabitSlots.MAX_FAMILY_HABITS
                + " 条了，先跟我说去掉哪一条，再记新的");
      }
      current.add(new FamilyHabit(slot, text));
    }
    save(familyId, current);
    return current;
  }

  public List<FamilyHabit> remove(String familyId, String slotRaw) {
    String slot = slotRaw == null ? "" : slotRaw.trim();
    if (!HabitSlots.isKnown(slot)) {
      throw ApiException.of(ErrorCodes.INVALID_HABIT, "没有这类习惯可删，换个说法试试？");
    }
    List<FamilyHabit> current = new ArrayList<>(load(familyId));
    int idx = indexOfSlot(current, slot);
    if (idx < 0) {
      throw ApiException.of(
          ErrorCodes.NOT_FOUND, "家里还没有「" + HabitSlots.label(slot) + "」这条习惯");
    }
    current.remove(idx);
    save(familyId, current);
    return current;
  }

  private List<FamilyHabit> load(String familyId) {
    return repository
        .findHabitsJson(familyId)
        .map(this::parse)
        .orElse(List.of());
  }

  private List<FamilyHabit> parse(String json) {
    try {
      List<Map<String, Object>> raw =
          objectMapper.readValue(json, new TypeReference<>() {});
      List<FamilyHabit> out = new ArrayList<>();
      for (Map<String, Object> row : raw) {
        if (row == null) {
          continue;
        }
        String slot = row.get("slot") == null ? "" : String.valueOf(row.get("slot")).trim();
        String text = row.get("text") == null ? "" : String.valueOf(row.get("text")).trim();
        if (!HabitSlots.isKnown(slot) || text.isEmpty()) {
          continue;
        }
        if (indexOfSlot(out, slot) >= 0) {
          continue;
        }
        if (out.size() >= HabitSlots.MAX_FAMILY_HABITS) {
          break;
        }
        if (text.length() > HabitSlots.MAX_TEXT_LEN) {
          text = text.substring(0, HabitSlots.MAX_TEXT_LEN);
        }
        out.add(new FamilyHabit(slot, text));
      }
      return List.copyOf(out);
    } catch (Exception e) {
      return List.of();
    }
  }

  private void save(String familyId, List<FamilyHabit> habits) {
    try {
      List<Map<String, String>> rows = new ArrayList<>();
      for (FamilyHabit h : habits) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("slot", h.slot());
        m.put("text", h.text());
        rows.add(m);
      }
      String json = objectMapper.writeValueAsString(rows);
      repository.upsertHabitsJson(familyId, json, Timestamp.from(Instant.now()));
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw ApiException.of(ErrorCodes.INTERNAL, "保存习惯失败");
    }
  }

  private static int indexOfSlot(List<FamilyHabit> habits, String slot) {
    for (int i = 0; i < habits.size(); i++) {
      if (slot.equals(habits.get(i).slot())) {
        return i;
      }
    }
    return -1;
  }
}
