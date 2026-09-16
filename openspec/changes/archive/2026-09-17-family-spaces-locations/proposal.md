## Why

MVP 已验证「家庭协同台账」闭环，但物资只有名称/数量/备注，无法表达「东西在哪」。下一版用空间与具体位置补齐归类与浏览，且保持清单仍是日常主路径，避免另造第二套库存。

## What Changes

- 新增文档库集合 `spaces`、`locations`（楼层 `floors` 仅模型预留，本版 UI 不露）
- `items` 增加 `spaceId`（创建时必有）与可选 `locationId`；无空间时懒创建默认「仓库」
- 新增云函数 `space`（空间/位置 CRUD、确保默认仓库）；扩展 `item` create/update 校验归属当前家庭
- 新增空间列表页、单空间页（默认氛围底图 + 该空间物资与位置文案）
- 家庭页增加「逛空间 / 家庭空间」入口；物资新增/编辑支持选空间与可选位置
- （可选，本变更可缓）全家清单按空间筛选
- **不做**：用户实景上传、3D/看房编辑器、官方固定房间包、icon 拼贴编辑器、楼层实体 UI

## Capabilities

### New Capabilities

- `family-spaces`: 家庭空间与具体位置的登记、默认仓库、空间浏览页与家庭入口；物资创建/编辑时的空间与位置归属

### Modified Capabilities

- （无；`openspec/specs/` 尚无已归档 capability。物资字段扩展的行为要求写在 `family-spaces` 内，实施时同步扩展现有 `item` 云函数与编辑页。）

## Impact

- `miniprogram/`：新页面（空间列表/单空间）、家庭页入口、物资编辑表单字段；`utils/cloud.js` 增加 `callSpace`；`utils/db.js` 可读 spaces/locations/按 spaceId 筛 items
- 云函数：新建 `space`；扩展 `item`；解散家庭时需清理 spaces/locations
- 云开发控制台：新集合、索引（`spaces.familyId`、`locations.spaceId`、`items.familyId+spaceId`）、安全规则（spaces/locations 客户端写 deny）
- 文档：回写 `AGENTS.md`、集合说明（如 `collections.md`）
- Agent 预留：空间/位置写仍走云函数 action，不另套改库；`items.source` 不变
- 权威范围源：`docs/plans/2026-09-10-next-spaces-locations.md`
