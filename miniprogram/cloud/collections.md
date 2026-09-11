# CloudBase 集合与索引（MVP + 空间/位置 + B 波标签/保质期 + C 波家庭消息）

对齐 `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`、`docs/plans/2026-09-10-next-spaces-locations.md` 与 `docs/plans/2026-09-10-next-abcd-roadmap.md`（B/C 波）。

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
| `expireReminderEnabled` | boolean | 家庭过期提醒总开关，默认 `true`；缺省按 true 处理 |
| `tagsSeededAt` | number \| null | 默认标签种子写入时间；有值后不再自动补种已删默认标签 |
| `createdAt` | number | |

不存 `memberOpenids[]`，不嵌空间树或标签目录。

### `memberships`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | `${openid}_${familyId}` |
| `openid` | string | |
| `familyId` | string | |
| `joinedAt` | number | |
| `subscribeExpireGrantedAt` | number \| null | 可选；该成员在该家庭接受过期订阅消息授权的时间 |

### `tags`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | |
| `name` | string | 标签名，最长 20 字 |
| `isDefault` | boolean | 是否来自默认种子 |
| `createdAt` | number | |
| `updatedAt` | number | |

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
| `tagIds` | string[] | 可选；本家庭 `tags._id`，默认 `[]` |
| `productionDate` | string \| null | 可选；生产日 `YYYY-MM-DD`（Asia/Shanghai 日历） |
| `expireDate` | string \| null | 可选；过期日 `YYYY-MM-DD`；无此字段则无临期/过期状态 |
| `expireReminderEnabled` | boolean | 物资级过期提醒，默认 `false` |
| `createdBy` | string | openid |
| `source` | string | `ui` \| `agent` |
| `createdAt` | number | |
| `updatedAt` | number | |

硬删除。旧数据若缺 `spaceId`，由 `space.ensureDefault` / `item` 写路径回填。旧数据缺 `tagIds` / 日期 / 提醒字段时按空数组 / null / false 处理。

临期/过期状态**不持久化**：由 `expireDate` 相对「今天」（Asia/Shanghai）派生——`expired`（早于今天）、`expiring`（今天…今天+3）、`normal`（更晚）。

### `activities`

家庭消息 / 物资改动日志（C 波）。**不**软删除物资本体；`remove` 事件靠本集合快照保留「谁删了什么」。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | 隔离键 |
| `itemId` | string | 物资 id（硬删后仍保留，便于按 item 查历史） |
| `action` | string | `create` \| `update` \| `remove` |
| `actorOpenid` | string | 操作者 |
| `itemName` | string | 写入时物资名快照（删除后 feed 仍可读） |
| `changedFields` | string[] | 可选；`update` 时变更字段键（如 `name`、`quantity`） |
| `summary` | string | 可选；中文变更摘要，供消息行展示 |
| `source` | string | `ui` \| `agent` |
| `createdAt` | number | |

仅由 `item` 云函数在 create/update/remove **成功后**旁路写入；活动插入失败不回滚物资写。列表读走 `activity.list`。

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
| `tags` | `familyId` | 普通 | 家庭标签列表 |
| `activities` | `familyId` ASC + `createdAt` DESC | 复合 | 家庭消息流倒序 |
| `activities` | `itemId` ASC + `createdAt` DESC | 复合 | 物资详情最近操作 |
| `items` | `familyId` ASC + `updatedAt` DESC | 复合 | 物资列表排序 |
| `items` | `familyId` ASC + `spaceId` ASC | 复合 | 按空间列物资 |
| `items` | `familyId` ASC + `expireDate` ASC | 复合 | 临期查询 / 定时提醒 |
| `items` | `locationId` | 普通 | 按位置反查（可选） |
| `spaces` | `familyId` | 普通 | 家庭空间列表 |
| `locations` | `spaceId` | 普通 | 空间下位置 |
| `locations` | `familyId` | 普通 | 解散/家庭维度清理 |

说明：按 `tagIds` 筛选可用数组包含查询；若控制台支持可为 `tagIds` 建多键索引，非必须。

## 安全规则

见同目录 `database-rules.json`。部署步骤：微信开发者工具 → 云开发 → 数据库 → 各集合权限 / 安全规则，按该文件粘贴。

**控制台还需手工：** 创建 `tags`、`activities` 集合；为 `items` 增加 `familyId + expireDate`；为 `activities` 增加 `familyId + createdAt`、`itemId + createdAt`（上表）。

实际读路径：`items` / `spaces` / `locations` / `tags` / `activities` 列表经云函数。客户端写一律 deny。

## 多家庭体验

- 可加入多个家庭；create 始终允许；join 仅当已是**该**家庭成员时返回 `ALREADY_IN_FAMILY`
- `users.currentFamilyId` 表示当前工作家庭；`listMyFamilies` / `switchFamily` 切换
- `updateBackground` 更新当前家庭背景（渐变 / 纯色 / 云存储图片）；主题写入 `globalData.theme`，**全站页面**共用同一背景与强调色
- 离开或解散后若仍有其他 membership，自动切到其中一个；否则回 onboarding
- 解散家庭时同步清理该家庭的 `items` / `spaces` / `locations` / `tags` / `activities` / `memberships`
- 关系写、物资写、空间/位置写、标签写、活动写一律云函数

## 订阅消息（B 波）

- 模板：**商品过期提醒**（编号 2201），tmplId `_oheW_DGsoqUxKsFIQrWSYIuoo4stYvsJv-JNf_uAiQ`
- 字段：`thing1` 商品名称 · `date3` 过期日期 · `short_thing8` 所属仓库 · `thing9` 商品位置 · `thing10` 备注
- 客户端：`utils/subscribeExpire.js`；云函数默认同一 tmplId，可用环境变量 `EXPIRE_SUBSCRIBE_TMPL_ID` 覆盖
- 定时触发器每日跑 `expireNotify`：筛双开关开启且 `expireDate` 为今天 / +1 / +3 的项，向已授权成员发送；也可从家庭页「立即检查提醒」手动触发（须小程序端调用，控制台测试无效）
