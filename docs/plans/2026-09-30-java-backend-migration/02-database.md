# 02 — 数据库设计（PostgreSQL）

权威 DDL 草稿：`server/src/main/resources/db/migration/V1__baseline_schema.sql`  
语义对照：`miniprogram/cloud/collections.md`

## 1. 为何用 PostgreSQL

- memberships / 标签多对多 / 容量订阅适合关系约束与事务  
- `background`、`family_trees`、`ai_capabilities` 用 JSONB 保留灵活性  
- 本地 Docker 镜像成熟；上线托管选项多  

**不采用**「原样 Mongo 镜像集合」作为长期方案（可作应急，不在默认路径）。

## 2. 集合 → 表映射

| 云开发集合 | 表 | 备注 |
|------------|-----|------|
| `users` | `users` | PK=`openid` |
| `families` | `families` | `background`→`background_json`；`entitlement`→`entitlement_json` |
| `memberships` | `memberships` | 复合主键 `(openid, family_id)` |
| `spaces` | `spaces` | `imageFileID`→`image_key` |
| `locations` | `locations` | 同上 |
| `tags` | `tags` | |
| `items` | `items` + `item_tags` + `item_images` | 拆数组 |
| `activities` | `activities` | `changed_fields` JSONB |
| `itemExpireSubs` | `item_expire_subs` | PK `(item_id, openid)` |
| `familySubscriptions` | `family_subscriptions` | PK=`family_id` |
| `redeemCodes` | `redeem_codes` | PK=`code_hash` |
| `familyAiKeys` | `family_ai_keys` | api_key 仅服务端 |
| `familyTrees` | `family_trees` | `tree_json` |
| `aiPrompts` | `ai_prompts` | |
| `aiCapabilities` | `ai_capabilities` | `apis_json` |
| `floors` | — | 本阶段不建 |

## 3. 规范化要点

1. **`tagIds[]` → `item_tags`**：筛选走 join；API 出入参仍可组装为 `tagIds` 数组以兼容小程序。  
2. **`imageFileIDs[]` → `item_images`**：`sort_order` 0..2；封面 = 最小 sort。响应可同时给 `imageFileID`/`imageUrls` 兼容字段。  
3. **时间**：库内 `TIMESTAMPTZ`；若前端仍要 epoch ms，在 API 层转换。日期字段 `production_date` / `expire_date` 用 `DATE`，日历 Asia/Shanghai。  
4. **硬删除物资**：与现网一致；activities 保留 item_id 与名称快照。  
5. **计数**：`families.member_count` / `item_count` 由写路径维护；异常时校准任务可后补。  
6. **users.current_family_id**：不加死 FK，避免离开/解散顺序问题。

## 4. 索引（与现网意图对齐）

已在 V1 迁移中创建：

- `families.invite_code` UNIQUE  
- `memberships(openid)` / `(family_id)`  
- `items(family_id, updated_at DESC)` / `(family_id, space_id)` / `(family_id, expire_date)`  
- `activities(family_id, created_at DESC)` / `(item_id, created_at DESC)`  
- `item_expire_subs(family_id, openid)` / `(item_id)`  
- `spaces(family_id)` / `locations(space_id|family_id)` / `tags(family_id)` / `family_ai_keys(family_id)`

## 5. 事务边界（实施时遵守）

| 操作 | 事务 |
|------|------|
| item create/update/remove | 物资 + tag/images + item_count；**activities 同事务更佳**；若要严格对齐「activity 失败不回滚物资」，则 activity 用独立 try |
| family dissolve | 按现网顺序删附属表 + memberships + family |
| redeem | 码状态 + subscription 同一事务 |
| AI 多 tool 执行 | 每 tool 调 domain service；批量语义对齐 createMany |

## 6. 后续迁移脚本（预留编号）

| 版本 | 内容 |
|------|------|
| V1 | 基线表（已建） |
| V2 | 种子 `ai_prompts` / `ai_capabilities`（从现 `promptAssist` / registry 导出） |
| V3 | 如需：搜索相关扩展（首页搜索产品项） |
| Vx | 生产数据导入专用（CloudBase 导出 → SQL/脚本） |

## 7. 数据迁移原则（购机 / 关云前）

1. 导出云开发各集合 JSON  
2. 转换脚本：openid 不变；`cloud://` → 下载再上传 MinIO/COS，写 `object_key`  
3. 校验：membership 数、item_count、invite_code 唯一、订阅未过期家庭  
4. 双跑期避免两边同时写同一家庭（开关按家庭或全局）
