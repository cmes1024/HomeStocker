# HomeStocker MVP 重设计：云开发家庭协同台账

> 日期：2026-09-10  
> 状态：**已落地（历史基线）**；2026-09-17 起请以 `docs/plans/2026-09-17-phase1-status.md` 与 `docs/README.md` 为准  
> 范围（当时）：从零按 MVP 重做产品闭环。后续已加上空间、标签、保质期、消息、主题、AI 录入等，**本文不再是待做清单**。  
> OpenSpec 归档：`openspec/changes/archive/2026-09-17-mvp-cloudbase-family-ledger/`

---

## 1. 问题与目标

现有 PRD/原型偏完整版（多家庭、角色权限、保质期、OCR、采购等）。本次从 MVP 重切，**先验证「家庭协同管物资」是否成立**。

**成功标准（可体验）：**
1. 用户 A 创建家庭，拿到邀请码  
2. 用户 B 用邀请码加入同一家庭  
3. A/B 都能对同一批物资做增删改查（名称、数量、备注）  
4. 未加入家庭的用户不能看到该家庭物资

**当时非目标（MVP 周）：** 多家庭切换 UI、角色/审批、位置/分类、保质期与订阅消息、OCR/语音、采购清单、**对话 Agent UI / LangGraph 服务**、软删除审计、ES 搜索。

> 后来实际做了：多家庭切换、空间/位置、标签、保质期与按人订阅、家庭消息、命名主题、AI 拍照/语音录入。仍不做：角色权限、采购、ES、对话半屏。见现状快照。

---

## 2. 已锁定决策

| 主题 | 决策 |
|------|------|
| MVP 核心 | 家庭协同（创建/加入 + 共享物资） |
| 成员权限 | 邀请码直加，全员同权 |
| 家庭数量 | **当时**体验上单家庭；关系模型已按多对多。**后来产品做成多家庭切换**（`listMyFamilies` / `switchFamily`）。 |
| 物资字段 | 仅名称、数量、备注 |
| 代码起点 | 裁剪现有 `miniprogram/`（保留 extend / pageRouter 等） |
| 云开发访问 | **混合修订**：列表等 **读** 可直连；**写**（物资增删改 + 家庭协同）一律云函数，便于 Agent tool 复用 |
| 人↔家庭建模 | **不用** `memberOpenids[]` / `familyIds[]` 互嵌；用关联集合 `memberships` |
| 数据库 | **云开发文档库**（不做 MySQL）；物资 **独立 `items` 集合**，不嵌进 `families` 文档 |
| Agent 预留 | MVP **不做对话 UI**；领域操作按「可被 Agent tool 调用」的云函数契约设计；与 `docs/plans/2026-09-07-ai-assistant-design.md` 对齐 |

---

## 3. 架构

```
┌─────────────────────────────────────────────┐
│  miniprogram（裁剪后）                        │
│  onboarding │ items │ family                 │
│  （预留）对话入口 → chatProxy，本版不实现 UI     │
│  utils/db.js（读）│ utils/cloud.js（写/协同）   │
└───────────────┬─────────────┬───────────────┘
                │ 读 items    │ family* / item* 写
                ▼             ▼
         云数据库 + 安全规则    云函数 family + item
                │             │
                └──────┬──────┘
                       ▼
     users / families / memberships / items
                       ▲
                       │ 同一领域写入口（预留）
              Agent 工具层（后接）
              chatProxy → Agent 服务 → call item/family
```

- 登录：云开发隐式鉴权（`traceUser: true`），以 `_openid` 为个人 id。  
- 家庭 id：`families._id`。  
- **双通道原则（预留）：** 页面与未来 Agent 必须写同一套领域操作，禁止 Agent 直连改库绕过校验。  
- 不引入独立业务后端作为 MVP 必需；`chatProxy` 目录可保留作后接壳子。

---

## 4. 数据模型

### 4.0 数据库选型与「货要不要塞进家庭文档」

#### 用文档库还是 MySQL？

| | 云开发文档库 | MySQL（云开发/自建） |
|--|--|--|
| 与小程序集成 | 原生、安全规则、免运维 | 要额外实例与连接，协同成本高 |
| 多对多 / 事务 | 无 join；用关联集合 + 云函数保证一致性 | 强项 |
| MVP 目标 | 验证协同闭环，优先快 | 过早引入关系建模与运维 |

**拍板：MVP 用云开发文档库。** 人↔家多对多用 `memberships` 模拟；真要复杂报表/强事务再评估 MySQL，不作为本版前提。

#### 货物嵌在 `families` 里，还是独立 `items`？

可以嵌，例如：

```js
families: { name, inviteCode, items: [ { name, quantity, note }, ... ] }
```

**适合：** 单人、货很少、几乎不并发改。  
**不适合本产品：** 多人同时改不同物资 → 整文档冲突；列表分页/按更新时间排序差；家庭文档体积上限（文档库单文档有大小限制）；删改一条货要动整家文档。

**拍板：物资独立集合 `items`，用 `familyId` 归属家庭。**  
读「这家的货」= `items.where({ familyId })` + 复合索引，和「家的人」走 `memberships` 同一套思路——**按查询边界拆集合，而不是按业务口语「都属于这家」塞进一个 JSON。**

人 ↔ 家庭同理：不用 `memberOpenids[]` / `familyIds[]` 互嵌，用 `memberships`。

```
users (_openid)          memberships                 families (_id)
     │                   ├─ openid                   │
     │                   ├─ familyId                 │
     └─ currentFamilyId  └─ (openid+familyId 唯一)   └─ inviteCode …
                              │
                              ▼
                           items.familyId
```

### 4.1 `users`（个人）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_openid` | string | 个人 id（系统字段） |
| `currentFamilyId` | string \| null | 当前工作家庭；MVP 有成员资格时必填 |
| `nickname` | string | 可选 |
| `updatedAt` | number | |

### 4.2 `families`（家庭）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | |
| `inviteCode` | string | 短码，唯一索引 |
| `ownerOpenid` | string | 解散等敏感操作 |
| `memberCount` | number | 冗余计数，由云函数维护，避免每次 count |
| `createdAt` | number | |

**不存** `memberOpenids[]`。

### 4.3 `memberships`（人↔家庭）

| 字段 | 类型 | 说明 |
|------|------|------|
| `openid` | string | 个人 id |
| `familyId` | string | 家庭 id |
| `joinedAt` | number | |

文档 `_id` 建议：`${openid}_${familyId}`，便于幂等。

**查询（均走索引）：**

| 需求 | 查询 |
|------|------|
| 我加入了哪些家 | `memberships.where({ openid })` |
| 这家有哪些人 | `memberships.where({ familyId })` |
| 是否已在这家 | `doc(openid_familyId).get` |
| 这家的物资 | `items.where({ familyId }).orderBy('updatedAt','desc')` |
| 当前上下文物资 | 读 `users.currentFamilyId` → 查 items |

### 4.4 `items`

| 字段 | 类型 | 说明 |
|------|------|------|
| `familyId` | string | 隔离键（只挂家庭） |
| `name` | string | 必填 |
| `quantity` | number | ≥ 0，默认 1 |
| `note` | string | 可空 |
| `createdBy` | string | openid |
| `source` | string | `ui` \| `agent`（预留；MVP 写 `ui`） |
| `updatedAt` | number | |
| `createdAt` | number | |

删除：MVP **硬删除**。列表复杂度随物资量增长，与成员数解耦。

### 4.5 索引（必须）

| 集合 | 索引 | 用途 |
|------|------|------|
| `families` | `inviteCode` 唯一 | 加入 |
| `memberships` | `openid` | 我的家庭 |
| `memberships` | `familyId` | 成员列表 |
| `memberships` | `openid` + `familyId` 唯一 | 防重复 |
| `items` | `familyId` + `updatedAt` | 物资列表 |

### 4.6 MVP 体验约束

- 已有任意 membership → create/join 返回 `ALREADY_IN_FAMILY`  
- 成功后写 membership + 设 `currentFamilyId`  
- 下一版多家庭：允许多条 membership + 切换改 `currentFamilyId`，**无需迁表**

---

## 5. 云函数契约

两个云函数按 `action` 分发：`family`（协同）、`item`（物资写 + Agent tool 面）。

### 5.1–5.4 `family`（create / join / getMyFamily / leave）

逻辑同前：membership 唯一性、邀请码、`currentFamilyId`、owner 解散清数据。关系写 **仅云函数**。

### 5.5 `item`（物资写路径 + Agent tool 面）

**所有物资写走这里**；列表读 MVP 仍可客户端直连。

| action | 入参（示意） | 说明 |
|--------|--------------|------|
| `create` | `{ name, quantity?, note?, source? }` | 家庭取自调用者 `currentFamilyId`；默认 `source=ui`，Agent 传 `agent` |
| `update` | `{ itemId, name?, quantity?, note? }` | 校验 item 属于当前家庭 |
| `remove` | `{ itemId }` | 硬删 |
| `get` | `{ itemId }` | 可选 |
| `search` | `{ keyword, limit? }` | **预留给 Agent**；MVP 可先按 name 简单匹配 |

鉴权：只用 `getWXContext().OPENID` → `currentFamilyId` + membership。  
**禁止**信任入参里的 `openid` / 任意 `familyId` 覆盖身份。

### 5.6 错误码

`{ ok: false, code, message }` / `{ ok: true, data }`

---

## 6. 安全规则（原则）

**users**：读本人；`currentFamilyId` 仅云函数可写。  
**families / memberships**：客户端写 deny；敏感读走云函数。  
**items**：**read** 限当前家庭；**write 客户端 deny**（一律 `item` 云函数，避免 UI/Agent 双路径校验漂移）。

---

## 7. 页面与导航

| 页面 | 职责 |
|------|------|
| `pages/onboarding/index` | 无 membership：创建 / 加入 |
| `pages/items/index` | 直连读列表 |
| `pages/items/edit` | 云函数写 |
| `pages/family/index` | 邀请码、成员数、离开/解散 |

对话入口本版不挂产品导航；后接时再挂半屏/悬浮（见 09-07 AI 设计）。  
工具：`utils/db.js`（读）、`utils/cloud.js`（`callFamily` / `callItem`）、`utils/session.js`。

---

## 8. 关键路径与错误处理

1. `cloud.init` → 确保 users  
2. 按 `currentFamilyId` / membership 分流  
3. 列表直连读；写走 `callItem`  
4. 无网络失败态 + 重试；不做离线队列

---

## 9. 邀请码

- `A-Z0-9` 长度 6；不自动轮换；家庭页复制

---

## 10. 测试要点

- [ ] 双账号协同闭环  
- [ ] 客户端无法直写 items  
- [ ] 已有 membership 再加入/创建被拒  
- [ ] 解散后回 onboarding  
- [ ] memberships / items 索引查询

---

## 11. 与旧文档关系

- **本文件 = MVP 范围源**  
- Agent 编排/产品细节：`docs/plans/2026-09-07-ai-assistant-design.md`  
- 本文件约束：**领域数据 + 可被 tool 调用的云函数面**

---

## 12. 建议实现顺序

1. 四集合 + 索引 + 规则（items 客户端只读）  
2. 云函数 `family` + `item`（search 可先 stub）  
3. onboarding → items → family  
4. 双账号验收  
5. 清理 demo 注册；保留 `chatProxy` 壳子

---

## 13. Agent 能力预留（本版不实现，必须遵守）

目标：后接「对话管货」时只加脑子和入口，不重做台账。

```
话术 → chatProxy（注入 OPENID）→ Agent（function calling）
         → item.* / family.getMyFamily / item.search
         → 同一文档库
页面写 ──→ 同一云函数写入口 ─────────────↗
```

| 项 | 做法 |
|----|------|
| 单一写模型 | 物资写只经 `item`；Agent tool = action 的 schema 包装 |
| 身份与家庭 | OPENID → `currentFamilyId` + membership；不信任客户端伪造身份 |
| `source` | `ui` / `agent`，便于审计 |
| `item.search` | 对话查询先走结构化检索，不默认 RAG |
| 会话态 | Agent checkpoint 按 `openid + currentFamilyId` |
| 入口 | 预留挂载点即可；MVP 不上聊天 UI / LangGraph / 语音 |
| chatProxy | 只中转+注身份；业务写库进 `item`/`family`，不进 Proxy |
| 反模式 | 不为「方便模型一次读完」把货嵌进家庭文档 |

**后接首批 tools：** `list_items` / `search_items` / `create_item` / `update_item` / `delete_item` / `get_family_summary`

---

## 14. 其他后续演进

- 多 membership + 切换 `currentFamilyId`  
- `memberships.role`；保质期、OCR、软删除  
- `item_events` 操作流水（Agent 审计）  
- 按 09-07 设计接对话 UI + Agent 服务  
