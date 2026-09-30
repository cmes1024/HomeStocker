# 04 — 云函数 Action ↔ REST 对照（防漏表）

## 本文定位（必读）

**不是「一次全量迁移云函数」。**

| 文档 | 角色 |
|------|------|
| **本文 04** | **盘点清单**：把现有云函数 action 一次列全，避免漏接口；按模块分节 |
| **[05-migration-roadmap](./05-migration-roadmap.md)** | **实施顺序**：按 M1→M2→… **拆模块逐步做、双跑切流** |

终局目标确实是「云函数全部退役」，但落地是 **一块模块迁完 → 小程序该模块开关切 Java → 再开下一块**。未轮到的模块继续打云函数。

模块 ↔ 阶段：

| 模块（本文分节） | 实施阶段 | 原云函数 |
|------------------|----------|----------|
| Auth | **M1** | （新，替代隐式 OPENID） |
| family | **M2** | `family` |
| item | **M3** | `item` |
| space / tag | **M4** | `space` / `tag` |
| activity | **M5** | `activity` |
| storage | **M6** | 云存储（非云函数） |
| notify | **M7** | `expireNotify` |
| ai | **M8** | `ai` |
| 小程序切流收尾 | **M9** | 去掉 callFunction |
| bootstrap / stt / chatProxy | **M9 评估** | 非主路径，确认引用后再弃 |

约定：

- Method 默认 `POST`（与小程序 callFunction 体传参一致，改动最小）；只读也可后续改 GET，但不阻塞迁移。  
- Path：`/api/{module}/{action}`  
- Body：尽量对齐原 `event` 字段名。  
- 鉴权：除 `auth/login` 外均需 `X-HS-Token`。  
- 实施时：**只改当前阶段对应分节**；完成后在 05 勾选，并回写本表「状态」。

---

## Auth — 阶段 M1（新，替代云函数隐式 OPENID）

| Action | Method / Path | 说明 | 状态 |
|--------|---------------|------|------|
| login | POST `/api/auth/login` | `{ code }` → token + user | todo |
| logout | POST `/api/auth/logout` | 删 session | todo |
| me | POST `/api/auth/me` | 当前用户与 currentFamily | todo |

---

## family — 阶段 M2（原 `cloudfunctions/family`）

| Action | Path | 状态 |
|--------|------|------|
| create | `/api/family/create` | todo |
| join | `/api/family/join` | todo |
| getMyFamily | `/api/family/getMyFamily` | todo |
| listMyFamilies | `/api/family/listMyFamilies` | todo |
| listMembers | `/api/family/listMembers` | todo |
| page | `/api/family/page` | todo |
| updateProfile | `/api/family/updateProfile` | todo |
| switchFamily | `/api/family/switchFamily` | todo |
| updateBackground | `/api/family/updateBackground` | todo |
| updateName | `/api/family/updateName` | todo |
| updateExpireReminder | `/api/family/updateExpireReminder` | todo |
| recordSubscribeExpire | `/api/family/recordSubscribeExpire` | todo |
| getEntitlement | `/api/family/getEntitlement` | todo |
| redeem | `/api/family/redeem` | todo |
| issueCodes | `/api/family/issueCodes` | todo |
| leave | `/api/family/leave` | todo |

旁路 / 隐含（无独立 action，实施时勿漏）：

- 建家：默认空间「仓库」、标签种子、`family_trees` 初始  
- leave / 解散：清理 memberships、items、spaces、locations、tags、activities、item_expire_subs、family_ai_keys、family_trees、family_subscriptions 等（对齐 collections.md）  
- THEME_IDS 白名单与小程序 `theme.js` 同步  

---

## item — 阶段 M3（原 `cloudfunctions/item`）

| Action | Path | 状态 |
|--------|------|------|
| create | `/api/item/create` | todo |
| createMany | `/api/item/createMany` | todo |
| update | `/api/item/update` | todo |
| remove | `/api/item/remove` | todo |
| removeMany | `/api/item/removeMany` | todo |
| merge | `/api/item/merge` | todo |
| get | `/api/item/get` | todo |
| detail | `/api/item/detail` | todo |
| editForm | `/api/item/editForm` | todo |
| list | `/api/item/list` | todo |
| count | `/api/item/count` | todo |
| search | `/api/item/search` | todo |
| listExpiring | `/api/item/listExpiring` | todo |
| home | `/api/item/home` | todo |

旁路：

- 成功写后 activities（含 create_batch 规则）  
- item_count / 容量门控  
- expire 订阅维护（清空过期日、删除物资时清订阅）  
- 详情内过期订阅面板相关字段（与现 service 对齐）  

---

## space — 阶段 M4（原 `cloudfunctions/space`）

| Action | Path | 状态 |
|--------|------|------|
| ensureDefault | `/api/space/ensureDefault` | todo |
| list | `/api/space/list` | todo |
| create | `/api/space/create` | todo |
| createMany | `/api/space/createMany` | todo |
| update | `/api/space/update` | todo |
| remove | `/api/space/remove` | todo |
| removeMany | `/api/space/removeMany` | todo |
| listLocations | `/api/space/listLocations` | todo |
| createLocation | `/api/space/createLocation` | todo |
| createLocationMany | `/api/space/createLocationMany` | todo |
| updateLocation | `/api/space/updateLocation` | todo |
| removeLocation | `/api/space/removeLocation` | todo |
| removeLocationMany | `/api/space/removeLocationMany` | todo |
| listItemsBySpace | `/api/space/listItemsBySpace` | todo |
| detail | `/api/space/detail` | todo |
| listPockets | `/api/space/listPockets` | todo |

旁路：结构写后重建 `family_trees`。

---

## tag — 阶段 M4（原 `cloudfunctions/tag`）

| Action | Path | 状态 |
|--------|------|------|
| ensureDefaults | `/api/tag/ensureDefaults` | todo |
| list | `/api/tag/list` | todo |
| create | `/api/tag/create` | todo |
| createMany | `/api/tag/createMany` | todo |
| update | `/api/tag/update` | todo |
| remove | `/api/tag/remove` | todo |
| removeMany | `/api/tag/removeMany` | todo |

旁路：结构写后重建 `family_trees`。

---

## activity — 阶段 M5（原 `cloudfunctions/activity`）

| Action | Path | 状态 |
|--------|------|------|
| list | `/api/activity/list` | todo |
| cursor | `/api/activity/cursor` | todo |

客户端写 deny。list 按 entitlement `activityLimit` 截断；join 昵称头像。

---

## ai — 阶段 M8（原 `cloudfunctions/ai`；建议 M8a→M8d 再拆）

| Action | Path | 状态 |
|--------|------|------|
| listKeys | `/api/ai/listKeys` | todo |
| addKey | `/api/ai/addKey` | todo |
| removeKey | `/api/ai/removeKey` | todo |
| setDefaultKey | `/api/ai/setDefaultKey` | todo |
| act | `/api/ai/act` | todo |

`act` 内部 tool（须调 domain，不是平行写库）— 对照 `ai/tools` + capabilities 种子：

| Tool / 能力 | 说明 | 状态 |
|-------------|------|------|
| item.search | | todo |
| item.listExpiring | | todo |
| item.create / createMany | | todo |
| item.update | | todo |
| item.remove / removeMany | confirm | todo |
| item.merge | confirm | todo |
| item.expireSubscribePanel | | todo |
| space.create / createMany | | todo |
| space.createLocation / createLocationMany | | todo |
| space.remove* 等 | 以 capabilities 种子 enabled 为准 | todo |
| tag.* | 以种子为准 | todo |
| knowledgeGet | | todo |
| page.get | 页面直达注册表 | todo |
| 编排：history / 查库 / 确认闸 / 回执 / presentation | V3 合同 | todo |

禁止：NL 关键词旁路；family.* / 密钥 CRUD 从模型计划硬拒绝。

---

## notify — 阶段 M7（原 `expireNotify`）

| 能力 | 形式 | 状态 |
|------|------|------|
| 每日临期扫描发送 | Scheduled job | todo |
| 手动「立即检查提醒」 | POST `/api/notify/expire/run`（成员可触发，对齐现网） | todo |

发送成功删 `item_expire_subs` 对应行；模板字段对齐 collections.md。

---

## storage — 阶段 M6（新，替代云存储）

| Action | Path | 状态 |
|--------|------|------|
| 预签名上传 | POST `/api/storage/presign` | todo |
| （可选）删除 | POST `/api/storage/remove` | todo |

小程序：选图压缩 → 直传 MinIO/COS → 把 key 交给 item/space 写接口。

---

## 聚合 / 引导 — 阶段 M9 评估（原 bootstrap 等）

| 原能力 | 处理 | 状态 |
|--------|------|------|
| `bootstrap.home` | 若仍被调用：并入 `item.home` / `family.page` 或提供 `/api/bootstrap/home`；实施前 grep 客户端引用 | todo |
| `stt` | 产品路径外：迁移期标记 deprecated，确认无引用后删除，不做 Java 版除非启用 | todo |
| `chatProxy` | 非产品路径：不迁移；确认无入口后废弃 | todo |

---

## 小程序调用点（改造清单，防漏）

**随各模块阶段增量改**，不是 M9 才第一次动客户端：每完成 Mx 后端，立刻把该模块路由切到 `java`。M9 只做「确认全切 + 去掉云初始化」。

实施时逐项替换：

| 区域 | 文件线索 | 状态 |
|------|----------|------|
| 通用云调用 / 读缓存 | `miniprogram/utils/cloud.js`、`queryCache.js`（若有） | todo |
| App 回前台 cursor | `miniprogram/app.js` | todo |
| 登录 | onboarding / app 启动 | todo |
| 物资 | `pages/items/**`、`packageBrowse/items/**` | todo |
| 家庭 | `pages/family/**` | todo |
| 空间口袋 | `packageBrowse/spaces/**`、`pockets/**` | todo |
| 订阅过期 | `utils/subscribeExpire.js` | todo |
| AI 密钥 | `packageAi/**`、`callAi.js` | todo |
| 管家 | `packageAiAssist/**` | todo |
| 上传图片 | ImagePicker / 各编辑页云上传 | todo |

`packageDemo` / `pages/chat`：可不迁；确保未挂产品入口即可。
