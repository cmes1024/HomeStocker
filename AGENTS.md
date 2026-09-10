# HomeStocker — Agent 指南

家庭物资管理微信小程序。当前从 **MVP 重做**：先验证「家庭协同管物资」，再接对话 Agent。

## 权威范围

- **MVP 实施唯一范围源：** `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`
- 完整 PRD / 功能清单 / 旧架构（`docs/PRD-*.md` 等）是愿景，**不是**本阶段范围
- Agent 编排细节：`docs/plans/2026-09-07-ai-assistant-design.md`（后接；MVP 不上对话 UI）
- OpenSpec：`openspec/`；变更用 openspec 工作流，勿手建 `changes/` 目录

## 产品 MVP（已锁定）

| 项 | 决策 |
|----|------|
| 核心 | 创建/加入家庭 + 共享物资台账 |
| 权限 | 邀请码直加，全员同权 |
| 家庭数 | **体验**单家庭；**模型**多对多（`memberships`） |
| 物资字段 | 仅 `name` / `quantity` / `note` |
| 不做 | 多家庭切换 UI、角色审批、位置分类、保质期、OCR、采购、对话 UI |

## 技术栈

- 微信**原生**小程序 + **云开发文档库**（不做 MySQL）
- 代码基线：裁剪现有 `miniprogram/`（保留 `extend/` / pageRouter 等）
- 去掉产品路径上的 `pages/demo/*`、`pages/chat/*`（可留目录；`chatProxy` 壳子可保留）

## 数据模型（文档库）

```
users (_openid, currentFamilyId)
memberships (openid + familyId，关系真相)
families (_id, inviteCode, ownerOpenid, memberCount)
items (familyId, name, quantity, note, createdBy, source)
```

- **禁止**把成员或物资嵌进 `families` 大数组
- 索引：`families.inviteCode`；`memberships.openid` / `familyId` / 复合唯一；`items.familyId+updatedAt`
- MVP：已有任意 membership 则不可再 create/join

## 云函数与写路径

- `family`：create / join / getMyFamily / leave（关系写仅云函数）
- `item`：create / update / remove / get / search（**物资写一律走这里**）
- 列表**读**可客户端直连；**写**禁止客户端直写 items（安全规则 deny）
- 身份只用云函数 `OPENID` → `currentFamilyId` + membership；不信任入参伪造身份

## Agent 预留（必须遵守，本阶段不实现）

- 页面与未来 Agent **同一写入口**（`item` / `family`），禁止 Agent 另套改库逻辑
- `items.source`：`ui` | `agent`
- 后接路径：`chatProxy`（注入 OPENID）→ Agent 服务 → tool 映射云函数 action
- 仓库内已有 `agent/`（LangGraph 雏形 + MockBackend）；接真库时应对齐上述云函数，不要平行造第二套领域模型
- 对话查询优先 `item.search` 结构化检索，不默认上 RAG

## 目录速览

| 路径 | 说明 |
|------|------|
| `miniprogram/` | 小程序 + `cloudfunctions/` |
| `docs/plans/` | 设计文档（以 2026-09-10 MVP 为准） |
| `agent/` | 对话 Agent 后端雏形（后接） |
| `family-supplies-prototype*` | HTML 原型参考，非运行时 |
| `openspec/` | 规格与变更 |

## 给 Agent 的工作约定

1. 改范围前先读 `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`
2. 新能力默认 YAGNI；多家庭 UI / 角色 / 保质期 / OCR / 对话 UI 不进当前 MVP
3. 人↔家用 `memberships`；物资独立 `items` + `familyId`
4. 领域写操作做成可被 tool 调用的云函数 action，保持单一写模型
5. 用户未要求时不要擅自 commit / push
