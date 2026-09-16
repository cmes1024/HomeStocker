# CloudBase 集合与索引

对齐代码与 `docs/plans/2026-09-17-phase1-status.md`。历史方案：MVP / 空间 / A→B→C / AI 分包。换环境步骤以本文为准。

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
| `background` | object | `{ type: 'theme', value: themeId }`。合法 `themeId`：`orange`（默认）/`red`/`blue`/`matcha`/`milk`/`taro`/`sakura`/`coral`/`mint`/`warm-gray`/`indigo`/`amber`/`forest`/`berry`/`clay`/`lavender`/`olive`。客户端按 id 解析三色；非法或缺失回落 `orange`。完整色值见 `docs/plans/2026-09-15-family-theme-system.md` |
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
| `expireReminderEnabled` | boolean | 遗留字段，不再作为提醒真相；读接口会覆盖为**当前用户**是否订阅了该物资 |
| `createdBy` | string | openid |
| `source` | string | `ui` \| `agent` |
| `createdAt` | number | |
| `updatedAt` | number | |

硬删除。旧数据若缺 `spaceId`，由 `space.ensureDefault` / `item` 写路径回填。旧数据缺 `tagIds` / 日期字段时按空数组 / null 处理。物资级提醒改记在 `itemExpireSubs`，不再用本字段做全家共用开关。

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
| `spaceId` | string | 可选；写入时空间 id |
| `spaceName` | string | 写入时空间名快照（可空） |
| `locationId` | string | 可选；写入时位置 id，无位置则为空 |
| `locationName` | string | 写入时位置名快照（可空） |
| `quantity` | number | 可选；`create` / `update` 时的数量快照 |
| `unit` | string | 可选；`create` 时的单位快照 |
| `changedFields` | string[] | 可选；`update` 时变更字段键（如 `name`、`quantity`） |
| `summary` | string | 可选；中文变更摘要，供消息行展示 |
| `source` | string | `ui` \| `agent` |
| `createdAt` | number | |

仅由 `item` 云函数在 create/update/remove **成功后**旁路写入；活动插入失败不回滚物资写。列表读走 `activity.list`。水位探针走 `activity.cursor`（最新一条的 `_id` / `createdAt`，不查昵称）。个人订阅开关不写 activities。

### `itemExpireSubs`

某成员对某物资的过期订阅（微信推送名单）。**不是**全家共用开关：同一花菜，A 已订阅时 B 仍可以是未订阅。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | `${itemId}_${openid}` |
| `familyId` | string | 隔离键 |
| `itemId` | string | |
| `openid` | string | 订阅者 |
| `createdAt` | number | |

仅 `item` 云函数在 create/update/remove 时维护；`expireNotify` 按此集合找接收人。**成功发出一条订阅消息后删除该条记录**（微信一次性模板用掉额度，详情回到未订阅，要再推需重新打开并授权）。清空过期日或删除物资时清掉该物资全部订阅。离开/解散清对应记录。客户端写 deny。

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

### `familyAiKeys`

家庭级 DeepSeek 密钥（明文只存在本集合；客户端接口只回掩码）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | 隔离键 |
| `provider` | string | V1 恒为 `deepseek` |
| `label` | string | 显示名，默认「DeepSeek」 |
| `baseUrl` | string | 系统写入 `https://api.deepseek.com/v1`，界面不展示、不允许用户改 |
| `model` | string | 系统写入 `deepseek-chat` |
| `apiKey` | string | 明文只存在本集合；任何给客户端的接口必须脱敏 |
| `isDefault` | boolean | 一家同时只允许一把默认 |
| `createdBy` | string | openid |
| `createdAt` | number | |
| `updatedAt` | number | |

上限 3 把。全员同权可增删。不要把明文 key 放进 `getMyFamily`。

### `aiPrompts`

应用级提示词（不是按家庭一份）。V1 文档 `_id` = `item-extract-v1`，由云函数 `ai` 在首次调用时写入；运营可在控制台改 `system`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 稳定 id，V1 用 `item-extract-v1` |
| `version` | number | |
| `system` | string | 系统提示词全文（含 `{{TODAY}}` 等占位符） |
| `updatedAt` | number | |

### `itemMedia`

物资旁路封面。清单/详情本版不渲染。V1 一件物资一封面，重复 attach 覆盖并尽力删旧文件。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `familyId` | string | |
| `itemId` | string | |
| `fileID` | string | 云存储 fileID |
| `createdAt` | number | |

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
| `itemExpireSubs` | `familyId` + `openid` | 复合 | 当前用户已订阅物资；离开/解散也可走此前缀 |
| `itemExpireSubs` | `itemId` | 普通 | 临期推送按物资找订阅人 |
| `items` | `familyId` ASC + `updatedAt` DESC | 复合 | 物资列表排序 |
| `items` | `familyId` ASC + `spaceId` ASC | 复合 | 按空间列物资 |
| `items` | `familyId` ASC + `expireDate` ASC | 复合 | 临期查询 / 定时提醒 |
| `items` | `locationId` | 普通 | 按位置反查（可选） |
| `spaces` | `familyId` | 普通 | 家庭空间列表 |
| `locations` | `spaceId` | 普通 | 空间下位置 |
| `locations` | `familyId` | 普通 | 解散/家庭维度清理 |
| `familyAiKeys` | `familyId` | 普通 | 家庭密钥列表 / 解散清理 |
| `itemMedia` | `itemId` | 普通 | 按物资挂图 |
| `itemMedia` | `familyId` | 普通 | 解散清理 |

说明：按 `tagIds` 筛选可用数组包含查询；若控制台支持可为 `tagIds` 建多键索引，非必须。`_id` 主键不用手建。`aiPrompts` 用固定 `_id`，不必另建索引。

## 换环境部署：集合与索引（控制台）

新小程序 / 新云开发环境按本节做一遍。入口：微信开发者工具 → 云开发 → 数据库。

### 1. 先建集合

每个集合点「添加集合」，名称必须完全一致：

`users` · `families` · `memberships` · `items` · `spaces` · `locations` · `tags` · `activities` · `itemExpireSubs` · `familyAiKeys` · `aiPrompts` · `itemMedia`

权限先随意；建完后把同目录 `database-rules.json` 里对应集合的规则贴进去（客户端写一律 deny）。

### 2. 控制台怎么加索引

打开某个集合 → 索引 → 添加索引：

| 弹窗项 | 怎么填 |
|--------|--------|
| 索引名称 | 自定，下表「建议名称」可直接抄 |
| 索引属性 | **唯一** 或 **非唯一**，见下表 |
| 索引字段 | 填字段名（如 `familyId`），右边选 **升序 / 降序** |
| `+` | 复合索引：点 `+` 再加下一字段，**顺序必须和下表一致** |

单字段索引不要点 `+`。复合索引 = 同一条索引里多个字段，不是建两条。

`activities` 的 `createdAt` 必须选 **降序**（消息流 `orderBy('createdAt', 'desc')`）。其余未标明的都用 **升序**。

### 3. 全量索引清单（逐条建）

| 集合 | 建议名称 | 属性 | 字段（按顺序） |
|------|----------|------|----------------|
| `families` | `inviteCode` | **唯一** | `inviteCode` 升序 |
| `memberships` | `openid` | 非唯一 | `openid` 升序 |
| `memberships` | `familyId` | 非唯一 | `familyId` 升序 |
| `memberships` | `openid_familyId` | **唯一** | `openid` 升序，`+` `familyId` 升序 |
| `items` | `familyId_updatedAt` | 非唯一 | `familyId` 升序，`+` `updatedAt` **降序** |
| `items` | `familyId_spaceId` | 非唯一 | `familyId` 升序，`+` `spaceId` 升序 |
| `items` | `familyId_expireDate` | 非唯一 | `familyId` 升序，`+` `expireDate` 升序 |
| `items` | `locationId` | 非唯一 | `locationId` 升序（可选） |
| `spaces` | `familyId` | 非唯一 | `familyId` 升序 |
| `locations` | `spaceId` | 非唯一 | `spaceId` 升序 |
| `locations` | `familyId` | 非唯一 | `familyId` 升序 |
| `tags` | `familyId` | 非唯一 | `familyId` 升序 |
| `activities` | `familyId_createdAt` | 非唯一 | `familyId` 升序，`+` `createdAt` **降序** |
| `activities` | `itemId_createdAt` | 非唯一 | `itemId` 升序，`+` `createdAt` **降序** |
| `itemExpireSubs` | `familyId_openid` | 非唯一 | `familyId` 升序，`+` `openid` 升序 |
| `itemExpireSubs` | `itemId` | 非唯一 | `itemId` 升序 |
| `familyAiKeys` | `familyId` | 非唯一 | `familyId` 升序 |
| `itemMedia` | `itemId` | 非唯一 | `itemId` 升序 |
| `itemMedia` | `familyId` | 非唯一 | `familyId` 升序 |

`itemExpireSubs` 不要再单独建 `familyId`：复合索引左边已是 `familyId`，解散按家清理可走前缀。主键 `_id` 已是 `${itemId}_${openid}`，也不用再为这对建唯一索引。

索引创建后控制台可能显示「构建中」，等变成「正常」再测列表 / 消息 / 临期推送。缺索引时云函数日志会出现「index hint」或查询失败。

## 安全规则

见同目录 `database-rules.json`。换环境：云开发 → 数据库 → 各集合权限 / 安全规则，按该文件粘贴。集合与索引逐步对照见上一节「换环境部署」。

实际读路径：`items` / `spaces` / `locations` / `tags` / `activities` 列表经云函数。`familyAiKeys` / `aiPrompts` / `itemMedia` 读也走云函数 `ai`。客户端写一律 deny。

## 多家庭体验

- 可加入多个家庭；create 始终允许；join 仅当已是**该**家庭成员时返回 `ALREADY_IN_FAMILY`
- `users.currentFamilyId` 表示当前工作家庭；`listMyFamilies` / `switchFamily` 切换
- `updateBackground` 更新当前家庭命名主题（`{ type: 'theme', value: themeId }`），`themeId` 须在云函数 `THEME_IDS` 白名单内（与 `theme.js` 的 `THEME_PRESETS` 同步）。写入 `globalData.theme`，**全站页面**共用同一套主色/副色/阴影色。不再支持渐变字符串、纯色或自定义氛围图。
- 离开或解散后若仍有其他 membership，自动切到其中一个；否则回 onboarding
- 解散家庭时同步清理该家庭的 `items` / `spaces` / `locations` / `tags` / `activities` / `itemExpireSubs` / `familyAiKeys` / `itemMedia` / `memberships`（旁路图云存储文件 best-effort 删除）；成员离开时清该人在该家的 `itemExpireSubs`，**不删**家庭 AI 密钥
- 关系写、物资写、空间/位置写、标签写、活动写、过期订阅写、AI 密钥/抽取/挂图写一律云函数

## 订阅消息（B 波）

- 模板：**商品过期提醒**（编号 2201），tmplId `_oheW_DGsoqUxKsFIQrWSYIuoo4stYvsJv-JNf_uAiQ`
- 字段：`thing1` 商品名称 · `date3` 过期日期 · `short_thing8` 所属仓库 · `thing9` 商品位置 · `thing10` 备注
- 客户端：`utils/subscribeExpire.js`；云函数默认同一 tmplId，可用环境变量 `EXPIRE_SUBSCRIBE_TMPL_ID` 覆盖
- 定时触发器每日跑 `expireNotify`：筛家庭总开关开启且 `expireDate` 为今天 / +1 / +3 的项，向 **该物资的订阅人**（`itemExpireSubs`）且已授权微信订阅的成员发送；发出成功则删掉该人这条订阅。也可从家庭页「立即检查提醒」手动触发（须小程序端调用，控制台测试无效）

## AI 分包（控制台检查项）

部署 `packageAi` 前在云开发控制台核对这些项。**不要把 DeepSeek / 测试 API Key 写进仓库或云函数环境变量截图。**

1. 集合 `familyAiKeys`、`aiPrompts`、`itemMedia` 已创建（云函数首次调用也会 `createCollection`，控制台建一次更稳）。
2. 三集合安全规则按 `database-rules.json` 粘贴：客户端读写均为 deny。
3. 索引：`familyAiKeys.familyId`；`itemMedia.itemId`、`itemMedia.familyId`。
4. 上传云函数 `ai`，云端安装依赖（含 `axios`）。
5. 函数配置：**超时 60 秒**（仓库 `cloudfunctions/ai/config.json` 已写 `timeout: 60`，控制台再确认一次）。
6. **允许云函数访问公网**（DeepSeek `https://api.deepseek.com`）。
7. 同步上传 `family`（解散路径会清密钥与旁路图）。
8. 「微信同声传译」插件已停维护。真机 `wx.serviceMarket.invokeService` 会返回 `ok` 但 `data` 为空，语音转写必须走云函数 **`ai.transcribe`**（openapi `SentenceRecognitionWX`）。请把云函数 `ai` **超时改成 60 秒并重新上传**。未开通服务市场或失败时请手打文字。
9. `aiPrompts` 文档 `item-extract-v1` 会在 `listKeys` / `addKey` / `extract` 时按仓库 `prompt.js` 同步（`version` 与 `system` 不一致则覆盖）；也可在控制台核对 `system` 正文。
