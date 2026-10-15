package com.homestocker.modules.ai.app;

import com.homestocker.common.TimeJson;
import com.homestocker.infra.jdbc.SubscriptionRepository;
import com.homestocker.infra.jdbc.SubscriptionRow;
import com.homestocker.modules.ai.app.AiKeyService.KeyRow;
import com.homestocker.modules.family.domain.HostedModelRules;
import com.homestocker.modules.family.domain.HostedModelRules.Decision;
import com.homestocker.modules.family.domain.HostedModelRules.Source;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ActKeyResolver {

  public record Selection(List<KeyRow> keys, boolean hostedPool, boolean blocked) {}

  private final AiKeyService aiKeyService;
  private final PlatformKeyService platformKeyService;
  private final PlatformKeyCooldown cooldown;
  private final SubscriptionRepository subscriptionRepository;

  public ActKeyResolver(
      AiKeyService aiKeyService,
      PlatformKeyService platformKeyService,
      PlatformKeyCooldown cooldown,
      SubscriptionRepository subscriptionRepository) {
    this.aiKeyService = aiKeyService;
    this.platformKeyService = platformKeyService;
    this.cooldown = cooldown;
    this.subscriptionRepository = subscriptionRepository;
  }

  public Selection select(String familyId) {
    List<KeyRow> familyKeys = aiKeyService.listForFamily(familyId);
    SubscriptionRow sub = subscriptionRepository.findByFamilyId(familyId).orElse(null);
    long now = System.currentTimeMillis();
    Decision decision =
        HostedModelRules.decide(
            sub == null ? null : sub.modelSource(),
            sub == null || sub.hostedModelUntil() == null ? null : sub.hostedModelUntil().getTime(),
            now,
            !familyKeys.isEmpty());
    if (decision.source() == Source.HOSTED) {
      List<KeyRow> picked =
          PlatformKeyFailover.pick(
              platformKeyService.listEnabledForCall(), id -> cooldown.cooling(id, now));
      return new Selection(picked, true, false);
    }
    if (familyKeys.isEmpty()) {
      return new Selection(List.of(), false, true);
    }
    return new Selection(familyKeys, false, false);
  }

  public static Long hostedUntilMs(SubscriptionRow sub) {
    if (sub == null || sub.hostedModelUntil() == null) {
      return null;
    }
    return TimeJson.toEpochMs(sub.hostedModelUntil());
  }
}
