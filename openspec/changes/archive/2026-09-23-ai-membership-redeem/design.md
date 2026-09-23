## Context

个人主体无法走微信虚拟支付。产品是全家同权台账，AI 录入与管家也是全家共用。现有 `familyAiKeys` BYOK 已承担模型费；本 change 只补「家庭级使用权」闸门与站外兑换。叙事方案：`docs/plans/2026-09-19-ai-membership-redeem/`。`docs/plans/VIP/` 是更完整套餐愿景，本 change 不实现。

约束：身份只信 `OPENID` → `currentFamilyId` → membership；客户端写 deny；领域写仍只走 `item` / `family` / `space` / `tag`；闸门只拦「能不能调 AI」，不复制领域校验。

## Goals / Non-Goals

**Goals:**

- 兑换码单次核销，绑定当前家庭，续兑延长 `expiresAt`
- `extract` / `transcribe` / `act` 服务端强制校验订阅
- 家庭页可查状态并兑换；admin 可批量发码
- 解散家庭时清订阅

**Non-Goals:**

- 微信支付 / 自动续费 / 订单表
- 个人会员、跨家庭席位、换绑
- 免费试用额度、usageLogs、成本熔断
- 用会员替代 BYOK
- 物资/空间/主题数量上限

## Decisions

### 1. 权益跟家庭，不跟用户

**Choice:** `familySubscriptions._id = familyId`；任意成员可用。

**Why:** 与全员同权一致；闲鱼可写「全家季卡」；云成本按家产生。

**Alternatives:** 个人席位（配偶不能用）；「付款人共享给当前家」（实现更绕，第一版不做）。

### 2. 站外售码 + `ai.redeem`

**Choice:** 闲鱼卖码；小程序 `ai.redeem`；库内只存 SHA-256；`issueCodes` 仅 `ADMIN_OPENID`。

**Why:** 个人主体无支付；码哈希防库泄露；发码集中在云函数避免控制台手填差错。

**Alternatives:** 控制台手工插文档（易错）；接第三方收银台（超范围）。

### 3. 硬闸：无有效订阅则拒 AI 调用

**Choice:** 第一版不做免费日额度；无订阅即 `SUBSCRIPTION_REQUIRED`。密钥 CRUD 与 `attachMedia` 不闸。

**Why:** 实现最简单；密钥页仍可预配；挂图是录入后续副作用，录入已被闸。

**Alternatives:** 免费 N 次/月（第二刀）；BYOK 跳过订阅（与「摊云成本」目标冲突，否决）。

### 4. 续期从 max(现到期, now) 起算

**Choice:** `expiresAt = max(existingExpiresAt, now) + days`。

**Why:** 未过期续兑不浪费剩余天数；已过期从今天重新起算。

### 5. 防双兑用条件更新

**Choice:** `where({ _id: codeHash, status: 'unused' }).update({ status: 'used', ... })`；`stats.updated === 0` 拒绝。

**Why:** 云开发无强事务时的实用并发控制。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 站外售虚拟权益政策灰度 | 文案不写「绕过微信支付」；权益表预留 `source` |
| 码泄露 / 二手转卖 | 哈希存储；吊销 `revoked`；不做换绑 |
| 一码绑错家 | 文案强调「兑到当前家庭」；第一版不换绑 |
| 强依赖收费过早 | 文档约定：AI 可用后再强依赖闸门上线 |
