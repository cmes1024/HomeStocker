# HomeStocker — Agent 指南

> **协作规则（每次会话必读）：** `.codebuddy/rules/change-approval.md` — 未经用户明确授权不改代码；改前先说明问题与方案，确认后再动手。

家庭物资管理微信小程序。协同台账 MVP 与 A/B/C 波已在 `reDesign` 落地。  
**第一阶段收口（现状）：** `docs/plans/2026-09-17-phase1-status.md` — 还剩用户体系、首页搜索；家庭管家（`packageAiAssist` + `ai.act`，V3 控制面已落地）密钥 BYOK 在 `packageAi/keys`。查库/history/prompt 优化见 `docs/plans/2026-09-22-ai-assist-context-retrieval/`。管家素养课表见 `docs/plans/2026-09-23-ai-assist-curriculum/`。**改管家出问题先读** `docs/plans/2026-09-23-ai-assist-curriculum/迭代指南.md`（按模块排查，禁止「说 xxx 就做 xxx」）。

**进行中：Java 后端迁移。** 小程序前端保留；openid 由 Java `code2session` 获取；**开发/部署以 Docker Compose 为准（不必本机 JDK/Maven）**。代码在 `server/`；实施向导 **`docs/plans/2026-09-30-java-backend-migration/`**（先读该目录 README 与 `05-migration-roadmap.md`）。**本分支已去掉云函数 / 云开发客户端路径**（`cloudfunctions/`、`wx.cloud` 均不在树内；主分支仍保留历史副本）。小程序配置见 `miniprogram/config/index.js`。仍须 Docker 联调与 M10 关云控制台 / 存量数据迁移。

## 权威范围

- **Java 后端迁移（进行中）：** `docs/plans/2026-09-30-java-backend-migration/`；代码 `server/`
- **第一阶段现状（对照代码）：** `docs/plans/2026-09-17-phase1-status.md`
- **MVP 基线决策：** `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`（范围已被后续波次超过，勿当待做清单）
- **空间版（已落地）：** `docs/plans/2026-09-10-next-spaces-locations.md`；归档 `openspec/changes/archive/2026-09-17-family-spaces-locations/`
- **A→B→C 路线图（已做完）：** `docs/plans/2026-09-10-next-abcd-roadmap.md`；归档 A `2026-09-17-item-detail-atmosphere-perf`、B `2026-09-11-item-tags-expiry-reminders`、C `2026-09-11-family-activity-messages`
- **近两日已合：** 命名主题、读缓存、AI 助手（归档 `2026-09-19-ai-assistant-v2` 等）、日志带地点（归档 `2026-09-17-activity-place-log-copy`）；口袋页/清单改版见 `docs/plans/2026-09-17-as-built-surfaces.md`。旧拍照录入 V1 已退役（历史见归档 `2026-09-17-package-ai-item-capture`）
- 完整 PRD / 功能清单 / 旧架构（`docs/PRD-*.md` 等）是愿景，**不是**本阶段范围；入口见 `docs/README.md`
- 对话 Agent 设计（09-07 半屏 LangGraph，后置）：`docs/plans/2026-09-07-ai-assistant-design.md`
- **AI 助手（已落地基线）：** `docs/plans/2026-09-17-ai-assistant-v2/`；`packageAiAssist` + `ai.act`
- **AI 助手 V3（已落地）：** `docs/plans/2026-09-22-ai-assistant-v3/` + 归档 `openspec/changes/archive/2026-09-23-ai-assistant-v3/` — 主路径 = history + 查库；废 recent/lastOps 会话袋；禁 NL 关键词路由
- **AI 助手上下文优化（已落地）：** `docs/plans/2026-09-22-ai-assist-context-retrieval/` + 归档 `openspec/changes/archive/2026-09-22-ai-assist-context-retrieval/` — 查库召回 / history 保回执 / prompt 瘦身
- **按图预填（进行中）：** `openspec/changes/ai-photo-prefill/` — 编辑页拍照后 `ai.capture` 一次性视觉抽取（只读、不写账、人核对后照旧 `item.create/update`）；视觉预设在 `ModelCatalog`（vision 标记），密钥复用家庭 BYOK + hosted 池
- **页面直达（`page.get`，已落地）：** Java `PageRegistry` + 能力 `page.get`；归档 `openspec/changes/archive/2026-09-23-ai-page-nav/`
- OpenSpec：`openspec/`；变更用 openspec 工作流，勿手建 `changes/` 目录

## 产品范围（已锁定）

| 项 | 决策 |
|----|------|
| 核心 | 创建/加入家庭 + 共享物资台账 |
| 权限 | 邀请码直加，全员同权 |
| 家庭数 | **多家庭**（`memberships` + `currentFamilyId`）；**免费档 1 家 / 2 人 / 50 件 / 消息 30 条**，兑换加强版后家/人/物不限、消息 200 条；见 `docs/plans/2026-09-21-capacity-membership-redeem/` |
| 物资字段 | `name` / `quantity` / `unit?` / `note` + `spaceId`（必填）/ `locationId`（可选）+ `tagIds[]` / `productionDate?` / `expireDate?` / `imageFileIDs[]`（最多 3）/ `imageFileID?`（封面=第一张）；过期订阅见 `itemExpireSubs`（按人×物资，非物品共用开关） |
| 空间 | 用户自建；无空间时懒创建默认「仓库」；空间浏览为辅，全家清单为主；空间/位置可配 `imageFileID` |
| 标签（B） | 家庭级 `tags` 集合；默认种子 + 自建；物资可多选；列表 API 可按标签筛，首页尚未做入口 |
| 保质期（B） | 可选日期；清单首页「即将过期」；订阅消息 3/1/0 天（**按人×物资**订阅 + 家庭总开关默认开） |
| 家庭消息（C） | 物资增删改写 `activities`；家庭消息流 + 详情最近操作；日志带空间/位置快照；仍硬删物资（删除留名称快照） |
| 家庭外观 | 命名主题（主色 / 副色 / 阴影色）；全站由 AppShell 注入 CSS 变量 |
| 清单交互（A） | 点击进详情；编辑/删除在详情；无长按删除；首页可按空间筛 |
| AI 助手 | `packageAiAssist` + `ai.act`：NL + 家庭树 + 能力表；BYOK；写走 `item`/`space`/`tag`（`source: agent`）。**V3 已落地：** history+查库、无会话操作袋，见 `docs/plans/2026-09-22-ai-assistant-v3/` |
| 第一阶段还剩 | 用户体系（昵称/头像已落地待验收）；搜索（首页搜索栏目前只是装饰） |
| 不做（本阶段） | 角色权限、软删除物资本体、评论/@/聊天、非物资写事件进消息、活动推送、楼层 UI、实景上传 / 3D / 看房编辑器、ES 搜索；已退役的拍照录入 V1 |
| 后置 | 对话半屏 / LangGraph 接真库；体验向新交互（原 D 波） |

## 技术栈

- 微信**原生**小程序 + **Java API**（`server/`：Java 17 + Spring Boot + PostgreSQL + Redis + MinIO）
- 本地开发以 Docker Compose 为准；见 `docs/plans/2026-09-30-java-backend-migration/06-local-dev.md`
- 小程序运行时配置：`miniprogram/config/index.js`
- 去掉产品路径上的 `pages/demo/*`、`pages/chat/*`（可留目录）

## 数据模型（领域）

```
users (_openid, currentFamilyId, nickname?, avatarUrl?)
memberships (openid + familyId，关系真相；subscribeExpireGrantedAt?)
families (_id, inviteCode, ownerOpenid, memberCount, background, expireReminderEnabled, tagsSeededAt?)
spaces (familyId, name, isDefault, coverKey?, imageFileID?)
locations (familyId, spaceId, name, imageFileID?)
tags (familyId, name, isDefault?)
items (familyId, name, quantity, unit?, note, spaceId, locationId?, tagIds[], productionDate?, expireDate?, imageFileIDs[]?, imageFileID?, createdBy, source)
itemExpireSubs (_id=`itemId_openid`, familyId, itemId, openid, createdAt)
activities (familyId, itemId, action, actorOpenid, itemName, spaceName?, locationName?, changedFields?, summary?, source, createdAt)
familyAiKeys / aiPrompts / familyTrees / aiCapabilities（AI 助手；客户端写 deny）
```

- **禁止**把成员、物资或空间树嵌进 `families` 大数组
- 可多 membership（受容量档 `familyLimit` 约束；免费默认 1）；create/join 撞限拒绝；同家重复 join 拒绝；切换改 `currentFamilyId`
- 持久化实现见 `server/`（PostgreSQL / Flyway）；历史云文档库字段说明在 **main** 分支 `miniprogram/cloud/collections.md`

## API 写路径（Java）

- 小程序经 `utils/cloud.js`（读缓存门面）→ `utils/javaApi.js` → `POST /api/{module}/{action}`
- 模块与云函数时期 action 名对齐：`family` / `item` / `space` / `tag` / `activity` / `bootstrap` / `ai` / `storage` / `notify`
- 身份：`X-HS-Token`（login 后下发）；服务端 openid → `currentFamilyId` + membership；不信任入参伪造身份
- 物资写一律走 `item`；成功后旁路写 activities；AI 助手经白名单 tool 调同一写路径（`source: agent`）

## Agent 预留（必须遵守）

- 页面、AI 助手、未来对话 **同一写入口**（`item` / `family` / `space` / `tag`），禁止另套改库逻辑；活动由 `item` 写路径产生
- `items.source`：`ui` | `agent`（助手写走 `agent`）
- `packageAi` 仅 **密钥页**；助手 UI 在 `packageAiAssist`；不要复活 `pages/chat` 当本阶段入口
- **AI 助手** 走 Java `ai.act` + `packageAiAssist`，仍只调现有 `item`/`space`/`tag`；不要先上仓库根 `agent/` LangGraph
- 后接 09-07 式独立 Agent：Agent 服务 → tool 映射 Java API action（与当前管家不是同一刀）
- 仓库内已有 `agent/`（LangGraph 雏形 + MockBackend）；接真库时应对齐 Java API，不要平行造第二套领域模型
- 对话查询优先 `item.search` 结构化检索，不默认上 RAG
- **严禁自然语言意图关键词路由（硬禁）：** 禁止用正则 / 固定话术表，把用户句子或芯片文案映射成「必须走某条接口 / 旁路拼 calls / 改写计划」。意图、该增该减该删、确认后怎么执行，一律由模型根据上下文（FOCUS/R*/PROBE、history、`quantityBefore` 等机器事实）编排。允许：短号解析、白名单校验、确认闸门、空计划兜底、执行回执——**不是**「匹配到『各减一个』就自动 update」。客户端芯片点选只把原文/澄清句交给 `ai.act`，禁止 `if (/撤销|各减/.test(text))` 一类旁路。违规示例：`isUndoQtyAffirmChip`、`isDeleteAffirmChip`、按「刚加|刚才」升硬确认等。

## 目录速览

| 路径 | 说明 |
|------|------|
| `miniprogram/` | 小程序（本分支无云函数；配置 `config/index.js`） |
| `server/` | Java API（迁移目标后端） |
| `docs/plans/` | 设计文档；第一阶段现状见 `2026-09-17-phase1-status.md`；**Java 迁移向导**见 `2026-09-30-java-backend-migration/`；AI 助手见 `2026-09-17-ai-assistant-v2/` |
| `agent/` | 对话 Agent 后端雏形（后接；与 `server` 管家迁徙不是同一刀） |
| `family-supplies-prototype*` | HTML 原型参考，非运行时 |
| `openspec/` | 规格与变更 |

## 给 Agent 的工作约定

1. 改范围前先读 `docs/plans/2026-09-17-phase1-status.md`；历史决策再翻 MVP / 空间方案
2. 新能力默认 YAGNI；角色 / 对话半屏 / 实景 3D / 软删除 / ES 不进当前阶段
3. 人↔家用 `memberships`；物资独立 `items`；空间/位置独立集合 + `familyId`；活动独立 `activities`
4. 领域写操作做成可被 tool 调用的 Java API action，保持单一写模型
5. 用户未要求时不要擅自 commit / push
6. **助手相关改动禁止再加 NL 关键词路由**（见上文「严禁自然语言意图关键词路由」）。办砸了按 `docs/plans/2026-09-23-ai-assist-curriculum/迭代指南.md` 先对三类：信息不够、私自决定并执行、拦截/忽略模型计划。不要在 prompt/hint 加「说 xxx 就做 xxx」
7. **禁止直接在 `main` 提交**：动手前先从 `main` 切开发分支（`docs/…` / `feature/…` / `fix/…`），改动只在分支上提交，再合并回 `main`（PR 或 `git merge --no-ff`）。`main` 只接受合并结果，不承载直接提交；分支提交后未获明确要求不 push
