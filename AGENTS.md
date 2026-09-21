# HomeStocker — Agent 指南

家庭物资管理微信小程序。协同台账 MVP 与 A/B/C 波已在 `reDesign` 落地。  
**第一阶段收口（现状）：** `docs/plans/2026-09-17-phase1-status.md` — 还剩用户体系、搜索、AI（V1 录入已合待验收；助手 V2 见 `docs/plans/2026-09-17-ai-assistant-v2/` 与 `openspec/changes/ai-assistant-v2/`）。

## 权威范围

- **第一阶段现状（对照代码）：** `docs/plans/2026-09-17-phase1-status.md`
- **MVP 基线决策：** `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`（范围已被后续波次超过，勿当待做清单）
- **空间版（已落地）：** `docs/plans/2026-09-10-next-spaces-locations.md`；归档 `openspec/changes/archive/2026-09-17-family-spaces-locations/`
- **A→B→C 路线图（已做完）：** `docs/plans/2026-09-10-next-abcd-roadmap.md`；归档 A `2026-09-17-item-detail-atmosphere-perf`、B `2026-09-11-item-tags-expiry-reminders`、C `2026-09-11-family-activity-messages`
- **近两日已合：** 命名主题、读缓存、AI 拍照录入（归档 `2026-09-17-package-ai-item-capture`）、日志带地点（归档 `2026-09-17-activity-place-log-copy`）；口袋页/清单改版见 `docs/plans/2026-09-17-as-built-surfaces.md`
- 完整 PRD / 功能清单 / 旧架构（`docs/PRD-*.md` 等）是愿景，**不是**本阶段范围；入口见 `docs/README.md`
- 对话 Agent 设计（09-07 半屏 LangGraph，后置）：`docs/plans/2026-09-07-ai-assistant-design.md`  
- **AI 助手 V2：** `docs/plans/2026-09-17-ai-assistant-v2/` 与 `openspec/changes/ai-assistant-v2/` — 与 `packageAi` 拍照 V1、09-07 对话不是同一条
- OpenSpec：`openspec/`；变更用 openspec 工作流，勿手建 `changes/` 目录

## 产品范围（已锁定）

| 项 | 决策 |
|----|------|
| 核心 | 创建/加入家庭 + 共享物资台账 |
| 权限 | 邀请码直加，全员同权 |
| 家庭数 | **多家庭**（`memberships` + `currentFamilyId`）；**免费档 1 家 / 2 人 / 50 件**，兑换加强版后三项不限；见 `docs/plans/2026-09-21-capacity-membership-redeem/` |
| 物资字段 | `name` / `quantity` / `unit?` / `note` + `spaceId`（必填）/ `locationId`（可选）+ `tagIds[]` / `productionDate?` / `expireDate?`；过期订阅见 `itemExpireSubs`（按人×物资，非物品共用开关） |
| 空间 | 用户自建；无空间时懒创建默认「仓库」；空间浏览为辅，全家清单为主 |
| 标签（B） | 家庭级 `tags` 集合；默认种子 + 自建；物资可多选；列表 API 可按标签筛，首页尚未做入口 |
| 保质期（B） | 可选日期；清单首页「即将过期」；订阅消息 3/1/0 天（**按人×物资**订阅 + 家庭总开关默认开） |
| 家庭消息（C） | 物资增删改写 `activities`；家庭消息流 + 详情最近操作；日志带空间/位置快照；仍硬删物资（删除留名称快照） |
| 家庭外观 | 命名主题（主色 / 副色 / 阴影色）；全站由 AppShell 注入 CSS 变量 |
| 清单交互（A） | 点击进详情；编辑/删除在详情；无长按删除；首页可按空间筛 |
| AI 录入 V1 | `packageAi` 拍照分行 + 语音/手改 → 抽取 → 确认后走 `item.create`（`source: agent`）；家庭 BYOK；清单本版不出图 |
| AI 助手 V2 | 方案：`docs/plans/2026-09-17-ai-assistant-v2/`；change：`openspec/changes/ai-assistant-v2/`。NL 文本 + 家庭树 + 能力表；**未实施** |
| 第一阶段还剩 | 用户体系（昵称/头像已落地待验收）；搜索（首页搜索栏目前只是装饰）；AI V1 真机验收；V2 按 `openspec/changes/ai-assistant-v2/` 实施 |
| 不做（本阶段） | 角色权限、软删除物资本体、评论/@/聊天、非物资写事件进消息、活动推送、楼层 UI、实景上传 / 3D / 看房编辑器、ES 搜索 |
| 后置 | 对话半屏 / LangGraph 接真库；体验向新交互（原 D 波） |

## 技术栈

- 微信**原生**小程序 + **云开发文档库**（不做 MySQL）
- 代码基线：裁剪现有 `miniprogram/`（保留 `extend/` / pageRouter 等）
- 去掉产品路径上的 `pages/demo/*`、`pages/chat/*`（可留目录；`chatProxy` 壳子可保留）

## 数据模型（文档库）

```
users (_openid, currentFamilyId, nickname?, avatarUrl?)
memberships (openid + familyId，关系真相；subscribeExpireGrantedAt?)
families (_id, inviteCode, ownerOpenid, memberCount, background, expireReminderEnabled, tagsSeededAt?)
spaces (familyId, name, isDefault, coverKey?)
locations (familyId, spaceId, name)
tags (familyId, name, isDefault?)
items (familyId, name, quantity, unit?, note, spaceId, locationId?, tagIds[], productionDate?, expireDate?, createdBy, source)
itemExpireSubs (_id=`itemId_openid`, familyId, itemId, openid, createdAt)
activities (familyId, itemId, action, actorOpenid, itemName, spaceName?, locationName?, changedFields?, summary?, source, createdAt)
familyAiKeys / aiPrompts / itemMedia（AI 录入；客户端写 deny）
```

- **禁止**把成员、物资或空间树嵌进 `families` 大数组
- 索引：`families.inviteCode`；`memberships.openid` / `familyId` / 复合唯一；`items.familyId+updatedAt` / `familyId+spaceId` / `familyId+expireDate`；`spaces.familyId`；`locations.spaceId`；`tags.familyId`；`activities.familyId+createdAt` / `itemId+createdAt`；`itemExpireSubs.familyId+openid` / `itemId`
- 可多 membership（受容量档 `familyLimit` 约束；免费默认 1）；create/join 撞限拒绝；同家重复 join 拒绝；切换改 `currentFamilyId`
- 字段与索引细节、换环境控制台步骤见 `miniprogram/cloud/collections.md`

## 云函数与写路径

- `family`：create / join / getMyFamily / leave / listMyFamilies / switchFamily / updateName / updateBackground（仅命名主题） / updateExpireReminder / recordSubscribeExpire（关系写仅云函数；解散清理 spaces/locations/tags/activities/itemExpireSubs/familyAiKeys/itemMedia）
- `item`：create / update / remove / get / list / search / listExpiring（**物资写一律走这里**；成功后旁路写 activities）
- `space`：ensureDefault / list / create / update / remove / listLocations / createLocation / updateLocation / removeLocation / listItemsBySpace
- `tag`：ensureDefaults / list / create / update / remove
- `activity`：list（家庭消息 / 按 itemId 最近操作）；`cursor`（读缓存水位探针）；客户端写 deny
- `expireNotify`：定时触发，订阅消息临期提醒（须小程序端或 IDE 定时触发器鉴权）
- `ai`：密钥 / extract / transcribe / attachMedia（不替代 `item.create`）
- 列表**读**可走云函数（调用层有内存读缓存）；**写**禁止客户端直写 items/spaces/locations/tags/activities/itemExpireSubs/familyAiKeys/aiPrompts/itemMedia（安全规则 deny）
- 身份只用云函数 `OPENID` → `currentFamilyId` + membership；不信任入参伪造身份

## Agent 预留（必须遵守）

- 页面、AI 录入、未来对话 **同一写入口**（`item` / `family` / `space` / `tag`），禁止另套改库逻辑；活动由 `item` 写路径产生
- `items.source`：`ui` | `agent`（拍照录入走 `agent`）
- `packageAi` 是 **AI V1 录入向导**，不是对话 UI；不要复活 `pages/chat` 当本阶段入口
- **AI 助手 V2**（`docs/plans/2026-09-17-ai-assistant-v2/`）计划走云函数 `ai.act` + 新分包，仍只调现有 `item`/`space`/`tag`；不要先上 `agent/` LangGraph
- 后接 09-07 式独立 Agent：`chatProxy`（注入 OPENID）→ Agent 服务 → tool 映射云函数 action（与 V2 不是同一刀）
- 仓库内已有 `agent/`（LangGraph 雏形 + MockBackend）；接真库时应对齐上述云函数，不要平行造第二套领域模型
- 对话查询优先 `item.search` 结构化检索，不默认上 RAG

## 目录速览

| 路径 | 说明 |
|------|------|
| `miniprogram/` | 小程序 + `cloudfunctions/` |
| `docs/plans/` | 设计文档；第一阶段现状见 `2026-09-17-phase1-status.md`；AI 助手 V2 见 `2026-09-17-ai-assistant-v2/` |
| `agent/` | 对话 Agent 后端雏形（后接） |
| `family-supplies-prototype*` | HTML 原型参考，非运行时 |
| `openspec/` | 规格与变更 |

## 给 Agent 的工作约定

1. 改范围前先读 `docs/plans/2026-09-17-phase1-status.md`；历史决策再翻 MVP / 空间方案
2. 新能力默认 YAGNI；角色 / 对话半屏 / 实景 3D / 软删除 / ES 不进当前阶段（AI 录入验收除外）
3. 人↔家用 `memberships`；物资独立 `items`；空间/位置独立集合 + `familyId`；活动独立 `activities`
4. 领域写操作做成可被 tool 调用的云函数 action，保持单一写模型
5. 用户未要求时不要擅自 commit / push
