## Why

完整版 PRD（多家庭、角色、保质期、OCR、采购、对话 Agent）过重，无法尽快验证「家庭协同管物资」是否成立。需要按已锁定的 MVP 重设计，用微信原生小程序 + 云开发文档库交付可体验闭环：创建/加入家庭 + 共享物资增删改查。

## What Changes

- 引入云开发文档库四集合：`users`、`families`、`memberships`、`items`（物资独立集合，不嵌进家庭文档）
- 新增云函数 `family`（create / join / getMyFamily / leave）与 `item`（create / update / remove / get / search）
- 新增页面：onboarding（创建/加入）、items 列表与编辑、family（邀请码/离开）
- 读路径：客户端直连读 items 列表；写路径：物资与家庭关系一律云函数（为后接 Agent tool 预留单一写入口）
- 安全规则：items 客户端写 deny；memberships / families 客户端写 deny
- **BREAKING**：产品导航从 demo/chat 切到 MVP 页面；`pages/demo/*`、`pages/chat/*` 从产品路径移除（目录可留；`chatProxy` 壳子保留）
- MVP 不做：多家庭切换 UI、角色审批、位置分类、保质期、OCR、采购、对话 UI / LangGraph

## Capabilities

### New Capabilities

- `family-membership`: 创建/加入/离开家庭、邀请码、membership 与 currentFamilyId、MVP 单家庭体验约束
- `item-ledger`: 家庭共享物资台账（name / quantity / note）增删改查与安全隔离
- `mvp-shell`: 启动分流、会话工具、页面导航裁剪与云开发初始化

### Modified Capabilities

- （无；`openspec/specs/` 尚无既有 capability）

## Impact

- `miniprogram/`：新增 pages、utils（db/cloud/session）、云函数 `family`/`item`；裁剪 `app.json` 页面注册
- 云开发控制台：集合、索引、安全规则需部署
- `agent/`、对话 UI：本变更不实现；云函数契约需可被后接 tool 复用（`items.source`: `ui` | `agent`）
- 权威范围源：`docs/plans/2026-09-10-mvp-cloudbase-redesign.md`
