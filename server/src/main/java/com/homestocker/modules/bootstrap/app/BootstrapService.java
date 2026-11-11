package com.homestocker.modules.bootstrap.app;

import com.homestocker.modules.activity.app.ActivityService;
import com.homestocker.modules.family.app.FamilyService;
import com.homestocker.modules.family.app.InviteRewardService;
import com.homestocker.modules.item.app.ItemService;
import com.homestocker.modules.space.app.SpaceService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Port of cloudfunctions/bootstrap home: family + spaces + board + cursor in one round-trip.
 */
@Service
public class BootstrapService {

  private static final Logger log = LoggerFactory.getLogger(BootstrapService.class);

  private final FamilyService familyService;
  private final SpaceService spaceService;
  private final ItemService itemService;
  private final ActivityService activityService;
  private final InviteRewardService inviteRewardService;

  public BootstrapService(
      FamilyService familyService,
      SpaceService spaceService,
      ItemService itemService,
      ActivityService activityService,
      InviteRewardService inviteRewardService) {
    this.familyService = familyService;
    this.spaceService = spaceService;
    this.itemService = itemService;
    this.activityService = activityService;
    this.inviteRewardService = inviteRewardService;
  }

  public Map<String, Object> home(Map<String, Object> body) {
    settleInvitePending();
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

  /** 建家那次 claimInvite 失败时补发；任何异常都只写日志，不影响首页。 */
  private void settleInvitePending() {
    try {
      inviteRewardService.claimPendingIfAny();
    } catch (Exception e) {
      log.warn("invite pending settle failed: {}", e.toString());
    }
  }
}
