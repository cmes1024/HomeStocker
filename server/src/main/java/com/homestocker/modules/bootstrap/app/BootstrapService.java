package com.homestocker.modules.bootstrap.app;

import com.homestocker.modules.activity.app.ActivityService;
import com.homestocker.modules.family.app.FamilyService;
import com.homestocker.modules.item.app.ItemService;
import com.homestocker.modules.space.app.SpaceService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Port of cloudfunctions/bootstrap home: family + spaces + board + cursor in one round-trip.
 */
@Service
public class BootstrapService {

  private final FamilyService familyService;
  private final SpaceService spaceService;
  private final ItemService itemService;
  private final ActivityService activityService;

  public BootstrapService(
      FamilyService familyService,
      SpaceService spaceService,
      ItemService itemService,
      ActivityService activityService) {
    this.familyService = familyService;
    this.spaceService = spaceService;
    this.itemService = itemService;
    this.activityService = activityService;
  }

  public Map<String, Object> home(Map<String, Object> body) {
    Map<String, Object> event = body == null ? Map.of() : body;
    Map<String, Object> family = familyService.getMyFamily();
    spaceService.ensureDefault();
    Map<String, Object> spaces = spaceService.list();
    Map<String, Object> board = itemService.home(event);
    Map<String, Object> cursor = activityService.cursor();

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("family", family);
    out.put("spaces", spaces);
    out.put("board", board);
    out.put("cursor", cursor);
    return out;
  }
}
