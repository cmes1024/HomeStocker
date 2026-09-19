## Why

个人主体小程序无法开通微信支付与虚拟商品售卖，无法用官方支付摊平 AI 云函数与研发成本。需要一条站外售码、站内兑换的家庭级 AI 会员路径：闲鱼卖季卡兑换码，核销后绑定当前家庭，全员同权使用 AI V1 录入与 V2 管家。模型仍走家庭 BYOK，会员先卖「使用权」。权威叙述见 `docs/plans/2026-09-19-ai-membership-redeem/`。

## What Changes

- 新集合 `redeemCodes`（只存码哈希）与 `familySubscriptions`（一家一条，`_id = familyId`）
- 云函数 `ai` 新增 `getSubscription` / `redeem` / `issueCodes`（admin）；对 `extract` / `transcribe` / `act` 做订阅闸门
- `family` 解散路径清理该家 `familySubscriptions`
- 家庭页增加「AI 会员」兑换入口与到期展示；客户端不直写新集合
- **不做**：微信内购、个人席位、换绑、免费日额度计量、平台托管 Key、VIP 愿景里的物资/空间上限

## Capabilities

### New Capabilities

- `ai-membership-redeem`: 兑换码核销、家庭订阅真相、发码（admin）、AI 调用前订阅校验

### Modified Capabilities

- `ai-item-capture`: `extract` / `transcribe` 须当前家庭订阅未过期
- `ai-assistant-act`: `act` 须当前家庭订阅未过期
- `family-home-surface`: 家庭页增加会员兑换与到期展示行
- `family-membership`: 解散时清理该家订阅记录

## Impact

- 云函数：`ai`、`family`（解散清理）
- 文档库：两集合 + 客户端写 deny；索引见 `collections.md`（实现时回写）
- 小程序：家庭页兑换 UI；录入/助手对 `SUBSCRIPTION_REQUIRED` 提示
- 运营：`ADMIN_OPENID` 环境变量发码；闲鱼发货发明文码
- 文档：`docs/plans/2026-09-19-ai-membership-redeem/`；与 `docs/plans/VIP/` 愿景并存，本 change 只落地兑换码 MVP
