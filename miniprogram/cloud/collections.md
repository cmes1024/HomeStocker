# CloudBase 集合与索引（MVP）

对齐 `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`。

## 集合

### `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 使用 `openid`，便于安全规则 `get` |
| `_openid` | string | 与 `_id` 一致（云函数写入时显式带上） |
| `currentFamilyId` | string \| null | 当前工作家庭 |
| `nickname` | string | 可选 |
| `updatedAt` | number | |

### `families`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `name` | string | |
| `inviteCode` | string | 6 位 `A-Z0-9`，唯一 |
| `ownerOpenid` | string | |
| `memberCount` | number | 云函数维护 |
| `createdAt` | number | |

不存 `memberOpenids[]`。

### `memberships`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | `${openid}_${familyId}` |
| `openid` | string | |
| `familyId` | string | |
| `joinedAt` | number | |

### `items`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | 隔离键 |
| `name` | string | 必填 |
| `quantity` | number | ≥ 0，默认 1 |
| `note` | string | 可空 |
| `createdBy` | string | openid |
| `source` | string | `ui` \| `agent` |
| `createdAt` | number | |
| `updatedAt` | number | |

硬删除。

## 索引（控制台手工创建）

| 集合 | 索引 | 类型 | 用途 |
|------|------|------|------|
| `families` | `inviteCode` | 唯一 | 邀请码加入 |
| `memberships` | `openid` | 普通 | 我的家庭 |
| `memberships` | `familyId` | 普通 | 成员列表 |
| `memberships` | `openid` + `familyId` | 唯一 | 防重复（`_id` 已幂等，索引双保险） |
| `items` | `familyId` ASC + `updatedAt` DESC | 复合 | 物资列表排序 |

## 安全规则

见同目录 `database-rules.json`。部署步骤：微信开发者工具 → 云开发 → 数据库 → 各集合权限 / 安全规则，按该文件粘贴。

MVP 实际读路径：`items` 列表经云函数 `item.list`（客户端直连读在自定义规则下易因 `get(users)` 失败，故改为云函数）。

## MVP 体验约束

- 已有任意 membership → create/join 返回 `ALREADY_IN_FAMILY`
- 关系写与物资写一律云函数；列表读可客户端直连 `items`
