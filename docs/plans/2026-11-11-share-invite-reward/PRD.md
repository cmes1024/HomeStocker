# 分享体系 PRD — 邀请新用户获取家庭加强版

> 日期：2026-11-11 · 分支：`feature/share-invite-reward` · 状态：**已实现，待生产验收**
> 权威代码：`server/` + `miniprogram/`；场景与用例见 [场景测试与用例.md](./场景测试与用例.md)；遗留见 [待决策事项.md](./待决策事项.md)

## 1. 背景与目标

现有「家庭加强版」（`capacity_std`）只能由运营人工发兑换码（`family.redeem` / `issueCodes`），用户侧没有增长入口。本功能让**已有家庭的用户**通过微信分享邀请**从未拥有过家庭的新用户**，新用户完成首次建家后，给邀请者的家庭叠加一段加强版有效期。

目标：

- 复用既有家庭订阅模型，**不引入用户级 VIP**、不改容量闸门；
- 一条链接可被多个新用户激活，符合微信「一张卡片转发给多人」的实际形态；
- 奖励发放失败绝不影响新用户建家；
- 全流程只用本地环境联调，不触碰生产。

非目标：付费开通、多级分销、个人席位、AI 权益、把新人拉进邀请者的家庭。

## 2. 口径（已锁定）

| 项 | 定义 |
|----|------|
| 新人 | **从未拥有过家庭**（`users.has_ever_had_family = false`）。`leave` / 解散后该标记不回退，所以不可被反复刷 |
| 有效激活 | 新人**首次 `family.create` 建家成功**；仅点开链接不算 |
| 奖励 | 给**生成链接时冻结的那个家庭**叠加 `capacity_std`，`expiresAt = max(现有到期, now) + days` |
| 链接 | 长期有效、可被多人激活；失效后**只允许重新生成**，不迁移、不自动漂移；重新生成不重置累计计数 |
| 计数单位 | **邀请者 openid 全局**（不是按家庭），因为加强版允许多家庭，按家计会被放大 N 倍 |
| 去重 | 一个 `invitee_openid` 一辈子只能贡献一次奖励（全局唯一） |
| 参数 | 每次 +7 天；30 天窗口内最多 5 次；**累计天数不封顶**（不再截断） |
| A 与 B 的关系 | 无需任何关系：B 自己建家，与 A 的物资/成员完全隔离 |

## 3. 用户故事与流程

**US-1 生成链接**：A 已有家庭 → 家庭页看到「已邀请 N / 5 位新朋友」→ 链接有效时点「邀请好友一起用」触发系统分享；无有效链接时显示「重新生成链接」，点击后生成并冻结当前家庭。

**US-2 新人激活**：B 从分享卡片进入 → 落地页直接是「创建家庭」模式（不是加入 A 的家）→ 填名称创建成功 → 前端静默触发 `claimInvite` → A 的家庭 VIP 到期日延长。B 对该结果无感，失败也不影响 B。

**US-3 上限**：A 达上限后链接仍可点、B 仍可正常建家，只是不再发奖，A 侧显示「已达邀请上限」。

**US-4 链接失效**：A `leave` 或解散家庭后，旧链接不再发奖；A 重新建家后需显式「重新生成链接」。

```
A: family.getInviteLink → (needsRegenerate) family.createInviteLink → share(path ?inviteToken=...)
B: onboarding?inviteToken=... → family.create{name, inviteToken}
     ├─ 主事务：users CAS 置 has_ever_had_family + memberships + families + pending 归因
     └─ 独立事务：family.claimInvite → 校验 → family_subscriptions 续期 → granted/skipped
```

## 4. 功能需求与验收标准

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-1 | A 无家庭时不得生成链接 | `createInviteLink` 返回 `NO_FAMILY`；`getInviteLink` 返回 `needsRegenerate=true` |
| FR-2 | 链接绑定邀请者与奖励家庭 | 客户端不能传 `rewardFamilyId`；服务端从 token 反查 |
| FR-3 | 新人判定不可逆 | 首次 `create`/`join` 后置 true；`leave` 后仍为 true |
| FR-4 | 仅首次建家写入归因 | 老用户建第二个家不产生 pending；`invitee_openid` 唯一 |
| FR-5 | 发奖与建家事务解耦 | 奖励家庭已解散 / 外键异常时，B 的建家仍然成功 |
| FR-6 | 发奖前双重校验 | 链接 active、绑定信息一致、家庭存在、A 仍是成员，任一不满足记 `skipped` |
| FR-7 | 防自刷 | `invitee == inviter` 记 `SELF_INVITE` |
| FR-8 | 上限与续期 | 30 天窗口内最多 5 次（可配，0 = 不限）；每次固定发配置天数，累计不封顶 |
| FR-9 | 续期叠加 | 已有未过期订阅时从 `expiresAt` 续，不从 now 重算 |
| FR-10 | 前端缓存一致 | `getInviteLink` 登记为读；`claimInvite` / `createInviteLink` 走写失效 |
| FR-11 | 原邀请链路不变 | `inviteCode` → `family.join` 行为、分享文案、二次转发抹 query 均保持 |
| FR-12 | 不碰生产 | 本地联调只用 mock 登录 + `127.0.0.1`，仓库 `config/index.js` 保持生产地址 |

## 5. 数据模型（Flyway `V10__invite_reward.sql`）

| 表 / 列 | 说明 |
|---------|------|
| `users.has_ever_had_family` | 不可逆标记；迁移时把已有 membership 的用户全部回填为 `true` |
| `invite_links` | `token`(PK，24 位随机) / `inviter_openid` / `reward_family_id` / `status(active\|inactive)` / `created_at` |
| `invite_activations` | `invitee_openid`(PK，全局唯一) / `token` / `inviter_openid` / `reward_family_id` / `status(pending\|granted\|skipped)` / `days` / `skip_reason` / 时间戳 |

两张新表**都不设到 `families` 的外键**：户主解散家庭时链接与激活记录仍可保留，由发奖侧判定失效，避免外键报错连累建家事务。

`family_subscriptions.source` 新增取值 `invite`（`product = invite_reward`）。邀请是**只续期**：家庭已有订阅记录时只更新 `expires_at`，不改写 `plan_id / product / source / last_redeem_code_id`，避免冲掉兑换码开通留下的来源信息。

## 6. API

均为 `POST /api/family/{action}`，身份来自 `X-HS-Token`，不信任入参。

| action | 入参 | 返回要点 |
|--------|------|----------|
| `getInviteLink` | 无 | `enabled` / `rewardDays` / `token` / `rewardFamilyId` / `needsRegenerate` / `grantedCount` / `grantedDays` / `maxActivations` / `windowDays` |
| `createInviteLink` | 无 | 停用旧链接 + 生成新 token；无家庭抛 `NO_FAMILY` |
| `claimInvite` | 无 | `status = granted\|skipped\|none`，`reason`，`expiresAt`；异常一律吞掉返回 `skipped/ERROR` |

`family.create` 新增**可选**入参 `inviteToken`；`family.join` 无新增入参。两者返回值不变。

`getInviteSettings` / `updateInviteSettings` 读写平台级配置（`invite_settings` 单行表，仅 `ADMIN_OPENIDS` 可改，运营页「邀请奖励」卡入口）。

**配置来源以 DB 为准**：`V11` 会插入一行默认记录（7 天 / 5 次 / 开启），此后 `application.yml` 的 `homestocker.invite.reward-days` / `max-activations` 只在表为空时兜底，改环境变量不会生效；`INVITE_WINDOW_DAYS`（`homestocker.invite.window-days`）仍只来自配置，DB 不可改。

## 7. 边界与异常

| 场景 | 行为 |
|------|------|
| A 分享后 `leave`（非户主） | 已发权益留在原家、不追回；未发的激活记 `INVITER_LEFT` |
| A 解散家庭 | 家庭与订阅一并删除；旧链接记 `FAMILY_GONE`，B 建家不受影响 |
| A 有多家庭 | 奖励落在生成链接时冻结的家；`switchFamily` 不漂移；上限按 A 全局计 |
| A 想给另一个家拉新 | 重新生成链接（会停用旧链接），累计计数不重置 |
| B 只是点开 / 未建家 | 不产生奖励 |
| B 通过邀请码加入 A 的家 | 置不可逆标记，但**不计入分享奖励**；避免 `memberLimit=2`、隐私与「加入→离开→再加」低门槛循环 |
| 链接被二次转发 | 带 token 的仍算 A；被默认分享抹掉 query 则丢归因（少发奖，可接受） |
| 发奖未知异常 | 事务回滚，Controller 吞异常返回 `skipped/ERROR` 并留日志，pending 保留可重试 |

## 8. 风控与合规

- `has_ever_had_family` + 全局唯一 + A 侧上限，挡住「leave 复刷 / 同一小号复领 / 单链接无限续期」。
- 微信不提供接收方身份，归因依赖客户端携带 token；能防的是「重复计数与超额」，**挡不住批量全新小号**，靠上限与 `invite_activations` 留痕兜底。
- 「分享即得」有诱导分享的审核风险：UI 文案把奖励挂在「好友首次建立自己的家庭后」，而不是「分享」动作本身；上线前需产品确认（见待决策事项）。

## 9. 明确不做

个人级 VIP、B 加入 A 的家计奖励、延迟留存门槛与定时任务、设备指纹 / 小号识别、付费与多级分销、补偿或追回已发权益、链接自动迁移、`inviteCode` 一次性化。

## 10. 实现与方案的两处偏差（主动标注）

1. **新增 `pending` 状态**：原方案在 B 首次建家成功后由服务端判断「是否新人」，但此时 `has_ever_had_family` 已被置 `true`，无法再区分。实现改为：建家主事务内用 CAS 得出「首次」，随即把归因固化成一条 `pending`（写无外键表、不抛异常）；`claimInvite` 在独立事务里消费。语义不变，且让「判定在置 true 之前」真正成立。
2. **独立 `InviteController` + 3 个 action**：原方案是 `FamilyController` 加 2 个 action。为避免让 `FamilyService` 与发奖服务互相依赖，新增同前缀的 `InviteController`（`/api/family/getInviteLink`、`createInviteLink`、`claimInvite`），并补 `getInviteLink` 用于「取现有链接」——否则每次进家庭页都会重新生成、把已分享出去的链接弄失效。

## 11. 运维

- 上线前确认 `V10` 在生产库执行：会把**已建家的存量用户**标记为老用户（本轮生产仅几个已建家用户、尚未真正使用，符合预期）。
- 回滚：配置关闭分享入口 + 停用全部 active 链接即可；新增表列与既有逻辑无耦合，不需删数据。
- 监控：`invite_activations` 的 `status=skipped` 与 `skip_reason`、应用日志 `invite reward granted`。
