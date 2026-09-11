# HomeStocker — Agent 指南

家庭物资管理微信小程序。当前从 **MVP 重做**：先验证「家庭协同管物资」，再接对话 Agent。

## 权威范围

- **MVP 实施唯一范围源：** `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`
- **空间版（已落地规划）：** `docs/plans/2026-09-10-next-spaces-locations.md`；OpenSpec：`openspec/changes/family-spaces-locations/`
- **当前下一版范围源：** `docs/plans/2026-09-10-next-abcd-roadmap.md`（A→B→C→D）
- **当前实施焦点（A 波）：** `docs/plans/2026-09-10-next-a-item-detail-perf.md`；OpenSpec：`openspec/changes/item-detail-atmosphere-perf/`
- 完整 PRD / 功能清单 / 旧架构（`docs/PRD-*.md` 等）是愿景，**不是**本阶段范围
- Agent 编排细节：`docs/plans/2026-09-07-ai-assistant-design.md`（后接；不上对话 UI）
- OpenSpec：`openspec/`；变更用 openspec 工作流，勿手建 `changes/` 目录

## 产品范围（已锁定）

| 项 | 决策 |
|----|------|
| 核心 | 创建/加入家庭 + 共享物资台账 |
| 权限 | 邀请码直加，全员同权 |
| 家庭数 | **多家庭**：可继续创建/加入；`memberships` 多对多 + `currentFamilyId` 切换 |
| 物资字段 | `name` / `quantity` / `unit?` / `note` + `spaceId`（必填）/ `locationId`（可选） |
| 空间 | 用户自建；无空间时懒创建默认「仓库」；空间浏览为辅，全家清单为主 |
| 家庭外观 | 背景可设渐变 / 纯色 / 自定义图片（全站主题）；换图/退家清理旧云文件（A 波） |
| 清单交互（A） | 点击进详情；编辑/删除在详情；无长按删除 |
| 不做（A 波） | 标签、保质期、订阅消息、家庭消息流、对话 UI、楼层 UI、实景上传 / 3D / 看房编辑器 |
| 后置（B/C/D） | 标签与保质期/即将过期、家庭动态、体验向新交互 — 见路线图 |

## 技术栈

- 微信**原生**小程序 + **云开发文档库**（不做 MySQL）
- 代码基线：裁剪现有 `miniprogram/`（保留 `extend/` / pageRouter 等）
- 去掉产品路径上的 `pages/demo/*`、`pages/chat/*`（可留目录；`chatProxy` 壳子可保留）

## 数据模型（文档库）

```
users (_openid, currentFamilyId)
memberships (openid + familyId，关系真相)
families (_id, inviteCode, ownerOpenid, memberCount, background)
spaces (familyId, name, isDefault, coverKey?)
locations (familyId, spaceId, name)
items (familyId, name, quantity, unit?, note, spaceId, locationId?, createdBy, source)
```

- **禁止**把成员、物资或空间树嵌进 `families` 大数组
- 索引：`families.inviteCode`；`memberships.openid` / `familyId` / 复合唯一；`items.familyId+updatedAt` / `familyId+spaceId`；`spaces.familyId`；`locations.spaceId`
- 可多 membership；create 不限；join 同家重复拒绝；切换改 `currentFamilyId`
- 字段与索引细节见 `miniprogram/cloud/collections.md`

## 云函数与写路径

- `family`：create / join / getMyFamily / leave / listMyFamilies / switchFamily / updateBackground（关系写仅云函数；解散清理 spaces/locations）
- `item`：create / update / remove / get / list / search（**物资写一律走这里**；写入/校验 `spaceId`/`locationId`）
- `space`：ensureDefault / list / create / update / remove / listLocations / createLocation / updateLocation / removeLocation
- 列表**读**可走云函数；**写**禁止客户端直写 items/spaces/locations（安全规则 deny）
- 身份只用云函数 `OPENID` → `currentFamilyId` + membership；不信任入参伪造身份

## Agent 预留（必须遵守，本阶段不实现）

- 页面与未来 Agent **同一写入口**（`item` / `family` / `space`），禁止 Agent 另套改库逻辑
- `items.source`：`ui` | `agent`
- 后接路径：`chatProxy`（注入 OPENID）→ Agent 服务 → tool 映射云函数 action
- 仓库内已有 `agent/`（LangGraph 雏形 + MockBackend）；接真库时应对齐上述云函数，不要平行造第二套领域模型
- 对话查询优先 `item.search` 结构化检索，不默认上 RAG

## 目录速览

| 路径 | 说明 |
|------|------|
| `miniprogram/` | 小程序 + `cloudfunctions/` |
| `docs/plans/` | 设计文档（MVP + 下一版空间） |
| `agent/` | 对话 Agent 后端雏形（后接） |
| `family-supplies-prototype*` | HTML 原型参考，非运行时 |
| `openspec/` | 规格与变更 |

## 给 Agent 的工作约定

1. 改范围前先读 MVP 与 `docs/plans/2026-09-10-next-spaces-locations.md`
2. 新能力默认 YAGNI；角色 / 保质期 / OCR / 对话 UI / 实景 3D 不进当前阶段
3. 人↔家用 `memberships`；物资独立 `items`；空间/位置独立集合 + `familyId`
4. 领域写操作做成可被 tool 调用的云函数 action，保持单一写模型
5. 用户未要求时不要擅自 commit / push
