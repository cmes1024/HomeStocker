## Why

个人主体小程序不接微信内购；云开发套餐才是主要成本，而 AI 已 BYOK。需要用**内测兑换码**跑通「按家庭卖容量」：免费档限制家庭数、成员数与物资数，兑换后三项不限，从而回收重度家庭带来的读写增长，并验证付费意愿。

## What Changes

- 新增兑换码集合 `redeemCodes` 与家庭订阅 `familySubscriptions`（一家一条）
- 配置表驱动 plan/product：**免费 `familyLimit=1` / `memberLimit=2` / `itemLimit=50`**；加强版三项 `null`；支持 `limitsOverride` / `source` 预留
- `families.itemCount`（及可选 `entitlement` 快照含三项 limit）降低门控与展示查询成本
- 写路径门控：`item.create` / `createMany`；`family.create` / `join`（用户家数 + 目标家人数）；读路径不查会员
- 家庭页「加强版 · 内测兑换」展示与兑换；admin `issueCodes`
- 解散家庭时清理订阅；过限不踢人、不删物资，只拦新增
- **不做**：微信内购、AI 订阅硬闸、空间/标签/主题/图片上限、站内购买引导

## Capabilities

### New Capabilities

- `capacity-membership-redeem`: 兑换码核销、家庭容量订阅、发码（admin）、权益解析与到期回落

### Modified Capabilities

- `item-ledger`: 创建物资受家庭 `itemLimit` 约束；维护 `itemCount`
- `family-home-surface`: 家庭页展示加强版状态/件数（及可选人数）进度与兑换入口
- `family-membership`: 创建/加入受 `familyLimit` 与 `memberLimit` 约束；解散时清理该家 `familySubscriptions`

## Impact

- 云函数：`item`（物资门控 + 计数）、`family`（兑换/权益/家数与人数门控/解散清理）
- 文档库：两新集合 + `families` 字段；客户端写 deny；`collections.md` 回写
- 小程序：家庭页 UI；三类撞限文案；读缓存在兑换后作废
- 文档：`docs/plans/2026-09-21-capacity-membership-redeem/`；旧 `ai-membership-redeem` 不再作为实施合同
- 运营：`ADMIN_OPENID` 发码；站内不提站外购买渠道
