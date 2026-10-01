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

**状态说明（2026-10-01）：** 下列 REST / tool 代码层均为 **done**；「待 Docker 联调」指本机需启动 Docker Desktop 后验收，不是缺实现。客户端 `backendRoute` 已全 `java`。

---

## Auth — 阶段 M1（新，替代云函数隐式 OPENID）

| Action | Method / Path | 说明 | 状态 |
|--------|---------------|------|------|
| login | POST `/api/auth/login` | `{ code }` → token + user | done（待 Docker 联调） |
| logout | POST `/api/auth/logout` | 删 session | done（待 Docker 联调） |
| me | POST `/api/auth/me` | 当前用户与 currentFamily | done（待 Docker 联调） |

---

## family — 阶段 M2（原 `cloudfunctions/family`）

| Action | Path | 状态 |
|--------|------|------|
| create | `/api/family/create` | done（待联调） |
| join | `/api/family/join` | done（待联调） |
| getMyFamily | `/api/family/getMyFamily` | done（待联调） |
| listMyFamilies | `/api/family/listMyFamilies` | done（待联调） |
| listMembers | `/api/family/listMembers` | done（待联调） |
| page | `/api/family/page` | done（待联调） |
| updateProfile | `/api/family/updateProfile` | done（待联调） |
| switchFamily | `/api/family/switchFamily` | done（待联调） |
| updateBackground | `/api/family/updateBackground` | done（待联调） |
| updateName | `/api/family/updateName` | done（待联调） |
| updateExpireReminder | `/api/family/updateExpireReminder` | done（待联调） |
| recordSubscribeExpire | `/api/family/recordSubscribeExpire` | done（待联调） |
| getEntitlement | `/api/family/getEntitlement` | done（待联调） |
| redeem | `/api/family/redeem` | done（待联调） |
| issueCodes | `/api/family/issueCodes` | done（待联调） |
| leave | `/api/family/leave` | done（待联调） |

旁路 / 隐含（无独立 action，实施时勿漏）：

- 建家：默认空间「仓库」、标签种子、`family_trees` 初始  
- leave / 解散：清理 memberships、items、spaces、locations、tags、activities、item_expire_subs、family_ai_keys、family_trees、family_subscriptions 等（对齐 collections.md）  
- THEME_IDS 白名单与小程序 `theme.js` 同步  

---

## item — 阶段 M3（原 `cloudfunctions/item`）

| Action | Path | 状态 |
|--------|------|------|
| create | `/api/item/create` | done（待联调） |
| createMany | `/api/item/createMany` | done（待联调） |
| update | `/api/item/update` | done（待联调） |
| remove | `/api/item/remove` | done（待联调） |
| removeMany | `/api/item/removeMany` | done（待联调） |
| merge | `/api/item/merge` | done（待联调） |
| get | `/api/item/get` | done（待联调） |
| detail | `/api/item/detail` | done（待联调） |
| editForm | `/api/item/editForm` | done（待联调） |
| list | `/api/item/list` | done（待联调） |
| count | `/api/item/count` | done（待联调） |
| search | `/api/item/search` | done（待联调） |
| listExpiring | `/api/item/listExpiring` | done（待联调） |
| home | `/api/item/home` | done（待联调） |

旁路：

- 成功写后 activities（含 create_batch 规则）  
- item_count / 容量门控  
- expire 订阅维护（清空过期日、删除物资时清订阅）  
- 详情内过期订阅面板相关字段（与现 service 对齐）  

---

## space — 阶段 M4（原 `cloudfunctions/space`）

| Action | Path | 状态 |
|--------|------|------|
| ensureDefault | `/api/space/ensureDefault` | done（待联调） |
| list | `/api/space/list` | done（待联调） |
| create | `/api/space/create` | done（待联调） |
| createMany | `/api/space/createMany` | done（待联调） |
| update | `/api/space/update` | done（待联调） |
| remove | `/api/space/remove` | done（待联调） |
| removeMany | `/api/space/removeMany` | done（待联调） |
| listLocations | `/api/space/listLocations` | done（待联调） |
| createLocation | `/api/space/createLocation` | done（待联调） |
| createLocationMany | `/api/space/createLocationMany` | done（待联调） |
| updateLocation | `/api/space/updateLocation` | done（待联调） |
| removeLocation | `/api/space/removeLocation` | done（待联调） |
| removeLocationMany | `/api/space/removeLocationMany` | done（待联调） |
| listItemsBySpace | `/api/space/listItemsBySpace` | done（待联调） |
| detail | `/api/space/detail` | done（待联调） |
| listPockets | `/api/space/listPockets` | done（待联调） |

旁路：结构写后重建 `family_trees`。

---

## tag — 阶段 M4（原 `cloudfunctions/tag`）

| Action | Path | 状态 |
|--------|------|------|
| ensureDefaults | `/api/tag/ensureDefaults` | done（待联调） |
| list | `/api/tag/list` | done（待联调） |
| create | `/api/tag/create` | done（待联调） |
| createMany | `/api/tag/createMany` | done（待联调） |
| update | `/api/tag/update` | done（待联调） |
| remove | `/api/tag/remove` | done（待联调） |
| removeMany | `/api/tag/removeMany` | done（待联调） |

旁路：结构写后重建 `family_trees`。

---

## activity — 阶段 M5（原 `cloudfunctions/activity`）

| Action | Path | 状态 |
|--------|------|------|
| list | `/api/activity/list` | done（待联调） |
| cursor | `/api/activity/cursor` | done（待联调） |

客户端写 deny。list 按 entitlement `activityLimit` 截断；join 昵称头像。

---

## ai — 阶段 M8（原 `cloudfunctions/ai`；建议 M8a→M8d 再拆）

| Action | Path | 状态 |
|--------|------|------|
| listKeys | `/api/ai/listKeys` | done（待联调） |
| addKey | `/api/ai/addKey` | done（待联调） |
| removeKey | `/api/ai/removeKey` | done（待联调） |
| setDefaultKey | `/api/ai/setDefaultKey` | done（待联调） |
| act | `/api/ai/act` | done（待联调；history/查库/确认闸/tools→domain；禁 NL 路由） |

`act` 内部 tool（须调 domain，不是平行写库）— 对照 `ai/tools` + capabilities 种子 v27（23 项 enabled）：

| Tool / 能力 | 说明 | 状态 |
|-------------|------|------|
| item.search | | done（`DomainTools` → ItemsProbe / ItemService） |
| item.listExpiring | | done |
| item.create / createMany | | done（`source=agent`） |
| item.update | | done |
| item.remove / removeMany | confirm | done |
| item.merge | confirm | done |
| item.expireSubscribePanel | | done |
| space.create / createMany | | done |
| space.createLocation / createLocationMany | | done |
| space.remove* | 种子 enabled | done |
| tag.create / createMany / remove / removeMany | 种子 enabled | done |
| knowledge.get | | done |
| page.get | 页面直达注册表 | done |
| 编排：history / 查库 / 确认闸 / 回执 / presentation | V3 合同 | done（`AiActService`） |

禁止：NL 关键词旁路；family.* / 密钥 CRUD 从模型计划硬拒绝。

---

## notify — 阶段 M7（原 `expireNotify`）

| 能力 | 形式 | 状态 |
|------|------|------|
| 每日临期扫描发送 | Scheduled job | done（待联调） |
| 手动「立即检查提醒」 | POST `/api/notify/expire/run`（成员可触发；家庭页已接） | done（待联调） |

发送成功删 `item_expire_subs` 对应行；无微信密钥时 dry-run（不消费订阅）；模板字段对齐 collections.md。

---

## storage — 阶段 M6（新，替代云存储）

| Action | Path | 状态 |
|--------|------|------|
| 预签名上传 | POST `/api/storage/presign` | done（`cloudImage` 直传；`public-endpoint` 给小程序） |
| （可选）删除 | POST `/api/storage/remove` | done（待联调） |

小程序：选图压缩 → 直传 MinIO/COS → 把 publicUrl/key 交给 item/space 写接口。

---

## 聚合 / 引导 — 阶段 M9 评估（原 bootstrap 等）

| 原能力 | 处理 | 状态 |
|--------|------|------|
| `bootstrap.home` | `POST /api/bootstrap/home`（family + spaces + board + cursor） | done（待联调；客户端 java） |
| `stt` | 产品路径外；无 Java 版；不做 | done（不适用） |
| `chatProxy` | 非产品路径；`packageDemo/chat` 已提示退役 | done（不适用） |

---

## 小程序调用点（改造清单，防漏）

**随各模块阶段增量改**，不是 M9 才第一次动客户端：每完成 Mx 后端，立刻把该模块路由切到 `java`。M9 只做「确认全切 + 去掉云初始化」。

| 区域 | 文件线索 | 状态 |
|------|----------|------|
| 通用云调用 / 读缓存 | `miniprogram/utils/cloud.js`、`queryCache.js` | done（仅 HTTP；cloud 抛 CLOUD_RETIRED） |
| App 回前台 cursor | `miniprogram/app.js` + `cloud.js` | done |
| 登录 | `app.js` / `javaApi.ensureLogin` | done |
| 物资 | `pages/items/**`、`packageBrowse/items/**` | done |
| 家庭 | `pages/family/**`（含立即检查提醒） | done |
| 空间口袋 | `packageBrowse/spaces/**`、`pockets/**` | done |
| 订阅过期 | `utils/subscribeExpire.js` → `recordSubscribeExpire` | done |
| AI 密钥 | `packageAi/**`、`callAi.js` | done |
| 管家 | `packageAiAssist/**` | done |
| 图片上传 | `utils/cloudImage.js` | done（presign PUT） |
| 上传图片 | ImagePicker / 各编辑页 | done（走 cloudImage） |

`packageDemo` / `pages/chat`：已退役提示；未挂产品入口。
