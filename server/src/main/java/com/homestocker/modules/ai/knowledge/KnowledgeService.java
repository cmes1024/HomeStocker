package com.homestocker.modules.ai.knowledge;

import com.homestocker.infra.jdbc.FamilyRepository;
import com.homestocker.infra.jdbc.ItemRepository;
import com.homestocker.modules.family.app.EntitlementService;
import com.homestocker.modules.family.domain.CapacityPlans.EffectiveEntitlement;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeService {

  private final EntitlementService entitlementService;
  private final FamilyRepository familyRepository;
  private final ItemRepository itemRepository;
  private final String capacityAdminWechat;

  public KnowledgeService(
      EntitlementService entitlementService,
      FamilyRepository familyRepository,
      ItemRepository itemRepository,
      @Value("${CAPACITY_ADMIN_WECHAT:}") String capacityAdminWechat) {
    this.entitlementService = entitlementService;
    this.familyRepository = familyRepository;
    this.itemRepository = itemRepository;
    this.capacityAdminWechat = capacityAdminWechat == null ? "" : capacityAdminWechat.trim();
  }

  public String renderIndex() {
    List<String> lines = new ArrayList<>();
    for (KnowledgePack p : KnowledgePacks.all()) {
      if (p.enabled()) {
        lines.add("- " + p.topicId() + "：" + (p.summary() != null ? p.summary() : p.title()));
      }
    }
    return lines.isEmpty() ? "无" : String.join("\n", lines);
  }

  public Map<String, Object> loadTopic(String topicId, String familyId, List<String> liveFacts) {
    KnowledgePack pack = KnowledgePacks.get(topicId);
    if (pack == null || !pack.enabled()) {
      return null;
    }
    String body = "capacity".equals(pack.topicId()) ? capacityBody() : pack.body();
    List<String> facts = liveFacts != null ? liveFacts : List.of();
    StringBuilder parts = new StringBuilder();
    if (!facts.isEmpty()) {
      parts.append("【当前家庭】\n");
      for (String line : facts) {
        if (line != null && !line.isBlank()) {
          parts.append(line).append('\n');
        }
      }
      parts.append('\n');
    }
    parts.append(body);
    String fullBody = parts.toString();
    return Map.of(
        "topicId", pack.topicId(),
        "title", pack.title(),
        "version", pack.version(),
        "body", fullBody,
        "text", pack.title() + "\n" + fullBody);
  }

  public List<String> loadCapacityLiveFacts(String familyId) {
    EffectiveEntitlement effective = entitlementService.resolveForFamily(familyId);
    int itemCount = itemRepository.countByFamily(familyId);
    int memberCount =
        familyRepository.findById(familyId).map(f -> f.memberCount()).orElse(0);
    List<String> facts = new ArrayList<>();
    if (effective.active() && effective.expiresAt() != null) {
      LocalDate d =
          Instant.ofEpochMilli(effective.expiresAt())
              .atZone(ZoneId.of("Asia/Shanghai"))
              .toLocalDate();
      facts.add("加强版有效中，约至 " + d + "；家数/人数/物资不限。");
    } else {
      facts.add("当前未开通加强版（按免费档）。");
    }
    String itemBit =
        effective.itemLimit() == null
            ? itemCount + " 件 · 不限"
            : itemCount + " / " + effective.itemLimit() + " 件";
    String memberBit =
        effective.memberLimit() == null
            ? memberCount + " 人 · 不限"
            : memberCount + " / " + effective.memberLimit() + " 人";
    facts.add("用量：" + itemBit + "；" + memberBit);
    if (effective.itemLimit() == null) {
      facts.add("本家物资件数不限。");
    } else {
      int left = Math.max(0, effective.itemLimit() - itemCount);
      facts.add("本家还能再添加约 " + left + " 件物资。");
    }
    return facts;
  }

  private String capacityBody() {
    String wx = capacityAdminWechat;
    String noCodeLine =
        !wx.isEmpty()
            ? "【还没有兑换码】可添加管理员微信申请内测名额（微信号：" + wx + "）。通过后会发放兑换码，再到家庭页 VIP 处兑换。小程序内不支持付费购买；助手不能生成、售卖或代兑码。"
            : "【还没有兑换码】内测码由运营按名额发放。请留意小程序内/官方后续通知；小程序内不支持付费购买；助手不能生成、售卖或代兑码。（管理员微信号未配置时勿编造联系方式。）";
    String buyAskLine =
        !wx.isEmpty()
            ? "【被问「多少钱 / 在哪买 / 闲鱼淘宝」】统一口径：站内不提供标价与购买渠道，也不介绍任何站外交易平台。需要加强版请添加上述管理员微信申请内测，不要去闲鱼/淘宝等平台找码。若对方追问私下按价交易，温和说明只接受官方内测申请，并回到免费档与兑换路径。"
            : "【被问「多少钱 / 在哪买 / 闲鱼淘宝」】统一口径：站内不提供标价与购买渠道，也不介绍任何站外交易平台。需要加强版请等官方内测通知领取兑换码。若对方追问私下交易，温和拒绝，并回到免费档与兑换路径。";
    String boundaryLine =
        !wx.isEmpty()
            ? "【本助手边界】不能建第二家、不能代加人、不能收款、不能发码、不能打开支付。最多说明规则，告知管理员微信号，并引导去家庭页自行兑换。"
            : "【本助手边界】不能建第二家、不能代加人、不能收款、不能发码、不能打开支付。最多说明规则，并引导去家庭页自行兑换；未配置管理员微信号时不要编造联系方式。";
    return String.join(
        "\n",
        "【免费档】每个微信号默认最多加入 1 个家庭；每个家庭最多 2 名成员、50 件物资。轻度使用通常够用。",
        "【加强版是什么】「家庭加强版」提升台账容量：有效期内家庭数、成员数、物资件数均不限。卖的是容量，不是 AI 次数；家庭管家仍用家庭自己的 AI 密钥。",
        "【本阶段怎么获得（重要）】当前是内测，小程序内没有付费购买入口，也不能在对话里付款或下单。获得方式：向管理员申请内测名额，领取「内测兑换码」后在家庭页开通。",
        "【已有兑换码】路径：打开家庭页 → 点当前家庭旁的 VIP → 输入兑换码 → 兑换。权益绑在当前家庭，该家全员共享。",
        noCodeLine,
        buyAskLine,
        "【到期】过期后回落免费档。已有家/人/物不会被删除或踢走，只是不能再继续增加。续期同样依赖新的内测兑换码（本阶段无自动续费）。",
        boundaryLine);
  }
}
