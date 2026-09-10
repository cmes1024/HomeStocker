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
| `background` | object | `{ type: 'gradient'\|'solid'\|'image', value }`，家庭页全屏背景 |
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

## 多家庭体验

- 可加入多个家庭；create 始终允许；join 仅当已是**该**家庭成员时返回 `ALREADY_IN_FAMILY`
- `users.currentFamilyId` 表示当前工作家庭；`listMyFamilies` / `switchFamily` 切换
- `updateBackground` 更新当前家庭背景（渐变 / 纯色 / 云存储图片）；主题写入 `globalData.theme`，**全站页面**共用同一背景与强调色
- 离开或解散后若仍有其他 membership，自动切到其中一个；否则回 onboarding
- 关系写与物资写一律云函数；列表读可走云函数 `item.list`
