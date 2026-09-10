# CloudBase 集合与索引（MVP + 空间/位置）

对齐 `docs/plans/2026-09-10-mvp-cloudbase-redesign.md` 与 `docs/plans/2026-09-10-next-spaces-locations.md`。

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

不存 `memberOpenids[]`，不嵌空间树。

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
| `unit` | string | 可选单位，如 `kg`、`瓶`，最长 10 字 |
| `note` | string | 可空 |
| `spaceId` | string | 必填（创建时保证有默认「仓库」） |
| `locationId` | string \| null | 可选；须属于该 `spaceId` |
| `createdBy` | string | openid |
| `source` | string | `ui` \| `agent` |
| `createdAt` | number | |
| `updatedAt` | number | |

硬删除。旧数据若缺 `spaceId`，由 `space.ensureDefault` / `item` 写路径回填。

### `spaces`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | |
| `name` | string | 如「仓库」「厨房」 |
| `floorId` | string \| null | 可选；本版 UI 不露 |
| `isDefault` | boolean | 默认仓库标记 |
| `coverKey` | string | 可选，默认氛围图 key（如 `default-indoor`） |
| `createdAt` | number | |
| `updatedAt` | number | |

### `locations`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | |
| `spaceId` | string | 所属空间 |
| `name` | string | 如「右边第一个柜子」 |
| `createdAt` | number | |
| `updatedAt` | number | |

### `floors`（模型预留，本版不建集合/UI）

大宅分组用；可用空间命名暂代（如「2F 主卧」）。

## 索引（控制台手工创建）

| 集合 | 索引 | 类型 | 用途 |
|------|------|------|------|
| `families` | `inviteCode` | 唯一 | 邀请码加入 |
| `memberships` | `openid` | 普通 | 我的家庭 |
| `memberships` | `familyId` | 普通 | 成员列表 |
| `memberships` | `openid` + `familyId` | 唯一 | 防重复（`_id` 已幂等，索引双保险） |
| `items` | `familyId` ASC + `updatedAt` DESC | 复合 | 物资列表排序 |
| `items` | `familyId` ASC + `spaceId` ASC | 复合 | 按空间列物资 |
| `items` | `locationId` | 普通 | 按位置反查（可选） |
| `spaces` | `familyId` | 普通 | 家庭空间列表 |
| `locations` | `spaceId` | 普通 | 空间下位置 |
| `locations` | `familyId` | 普通 | 解散/家庭维度清理 |

## 安全规则

见同目录 `database-rules.json`。部署步骤：微信开发者工具 → 云开发 → 数据库 → 各集合权限 / 安全规则，按该文件粘贴。

实际读路径：`items` / `spaces` / `locations` 列表经云函数（客户端直连读在自定义规则下易因 `get(users)` 失败，故与 MVP 一致走云函数）。客户端写一律 deny。

## 多家庭体验

- 可加入多个家庭；create 始终允许；join 仅当已是**该**家庭成员时返回 `ALREADY_IN_FAMILY`
- `users.currentFamilyId` 表示当前工作家庭；`listMyFamilies` / `switchFamily` 切换
- `updateBackground` 更新当前家庭背景（渐变 / 纯色 / 云存储图片）；主题写入 `globalData.theme`，**全站页面**共用同一背景与强调色
- 离开或解散后若仍有其他 membership，自动切到其中一个；否则回 onboarding
- 解散家庭时同步清理该家庭的 `items` / `spaces` / `locations` / `memberships`
- 关系写、物资写、空间/位置写一律云函数
