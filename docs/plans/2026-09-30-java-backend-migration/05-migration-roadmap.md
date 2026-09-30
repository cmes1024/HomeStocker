# 05 — 迁移路线图（实施勾选清单）

> 用途：后续每次开工打开本文，按阶段做、做完勾选。  
> 状态标记：`[ ]` 未做 · `[~]` 进行中 · `[x]` 完成 · `[-]` 取消/不适用  

关联：`04-api-mapping.md`（接口级）· `07-cutover-checklist.md`（关云）· `server/`（代码）

---

## M0 — 脚手架与本地基建

**目标：** 仓库可承载 Java 服务；文档齐全；本机能跑依赖（或列出阻塞）。

- [x] 分支 `feature/java-backend-migration`
- [x] `server/` Spring Boot 骨架、包结构、`/api/health`
- [x] `Dockerfile` + `docker-compose.yml`（Postgres / Redis / MinIO / **api**）
- [x] Flyway `V1__baseline_schema.sql`
- [x] 本目录设计与计划文档（开发前提改为 **只需 Docker**）
- [x] AGENTS.md / docs/README 挂接本目录（文档入口）
- [ ] 开发机安装 **Docker Desktop**（或兼容引擎）——**不必装 JDK/Maven**
- [ ] `cd server && docker compose up --build` 全绿
- [ ] `curl http://localhost:8080/api/health` 返回 ok

**出口：** 健康检查通过；阻塞项仅「未装 Docker」。

---

## M1 — 鉴权与公共层

**目标：** openid 只来自微信 API；后续模块可复用 FamilyContext。

- [ ] `WeChatClient.code2session`
- [ ] `POST /api/auth/login|logout|me`
- [ ] Redis session（`hs:sess:*`）+ `X-HS-Token` 过滤器
- [ ] `users` upsert
- [ ] 统一 `ApiResponse` / 错误码（对齐云函数常用 code）
- [ ] `FamilyContext`：解析 currentFamilyId + membership 校验工具
- [ ] 小程序：保存 token；开发者工具关域名校验；打通 login 探活
- [ ] 模块路由开关骨架（`java` / `cloud`）落在 `utils`（可先仅 auth=java）

**出口：** 开发者工具能 login，后续请求带 token 返回 me。

**验收：** 错误 code、无 secret 下发客户端、伪造 token 拒绝。

---

## M2 — family 模块

**对照：** `cloudfunctions/family` 全部 action（见 04）。

- [ ] create / join（容量 familyLimit / memberLimit / ALREADY_IN_FAMILY）
- [ ] getMyFamily / listMyFamilies / switchFamily / leave（含解散清理矩阵）
- [ ] listMembers / updateProfile
- [ ] updateName / updateBackground（THEME_IDS）
- [ ] updateExpireReminder / recordSubscribeExpire
- [ ] page（家庭页聚合，对齐现网字段）
- [ ] getEntitlement / redeem / issueCodes（ADMIN_OPENID）
- [ ] 建家种子：默认仓库 + 标签种子 + family_trees
- [ ] 小程序 family 相关调用切 `java`
- [ ] 写作废 L1 缓存策略接好

**出口：** onboarding 建家/加入/切换/家庭页主路径不走云函数 family。

**勿漏：** 离开后 currentFamilyId 回落；解散清理列表与 collections.md 一致。

---

## M3 — item 模块

**对照：** `cloudfunctions/item` + `service.js` 行为。

- [ ] create / createMany / update / remove / removeMany / merge
- [ ] get / detail / editForm / list / count / search / listExpiring / home
- [ ] item_tags / item_images 读写组装兼容 tagIds / imageFileIDs
- [ ] 容量 itemLimit + families.item_count
- [ ] activities 旁路（create_batch、摘要、地点快照）
- [ ] activityLimit 裁剪最旧消息
- [ ] 过期状态派生（上海日历）；expire 订阅字段按「当前用户」覆盖
- [ ] 小程序清单/详情/编辑切 java
- [ ] Redis cursor 在写后更新（可与 M5 一并，但写路径要留钩子）

**出口：** 清单增删改查、临期条、详情主路径走 Java。

**勿漏：** source=ui；硬删；合并吸收；home 聚合字段与现网一致。

---

## M4 — space + tag + familyTrees

- [ ] space 全部 action（含 listPockets / detail / listItemsBySpace）
- [ ] tag 全部 action
- [ ] ensureDefault / ensureDefaults
- [ ] 结构写后重建 family_trees + Redis 树缓存失效
- [ ] 删除空间/位置的约束（有物资时行为对齐现网）
- [ ] 小程序 browse / 家庭标签页切 java

**出口：** 空间浏览、口袋、标签管理不走云函数。

---

## M5 — activity + 读缓存 cursor

- [ ] activity.list（成员资料 join、limit）
- [ ] activity.cursor（Redis + DB）
- [ ] 小程序回前台探针改打 Java
- [ ] 确认 L1 写作废表仍覆盖物资域/家庭域
- [ ] 家庭消息页切 java

**出口：** 消息流 + 省额度缓存行为与现网合同一致。

---

## M6 — 对象存储

- [ ] MinIO bucket 初始化脚本/说明
- [ ] presign 上传 API
- [ ] 小程序 ImagePicker / 编辑页改直传
- [ ] item/space/location/avatar 存 object_key；读返回可访问 URL
- [ ] 换图/删实体 best-effort 删旧对象
- [ ] （可选）云存储存量迁移脚本草案

**出口：** 新上传不再写 `cloud://`。

---

## M7 — expireNotify

- [ ] 定时任务 cron（本地可手动触发）
- [ ] 筛选：家庭总开关 + expireDate 今天/+1/+3 + item_expire_subs
- [ ] 调微信订阅消息发送；成功删订阅
- [ ] POST 手动 run（家庭页「立即检查」）
- [ ] tmplId 配置化
- [ ] 文档标明：真机推送可能需公网/合法域名，本地先测查询与拼装

**出口：** 手动 run 在日志中体现正确收件人集合；真机推送可记为购机后项。

---

## M8 — AI（密钥 + act）

**对照：** V2/V3 方案、context-retrieval、curriculum、capabilities 种子。

- [ ] listKeys / addKey / removeKey / setDefaultKey（掩码、上限 3、默认一把）
- [ ] 种子迁移 V2：ai_prompts / ai_capabilities
- [ ] act 编排移植：history、查库、FOCUS/R*/PROBE、确认闸、回执
- [ ] tools 全部走 Item/Space/Tag 等 domain（无平行写）
- [ ] knowledgeGet / page.get
- [ ] 禁 NL 关键词路由（code review 检查表）
- [ ] Redis rate limit（可选但建议）
- [ ] 小程序 packageAi + packageAiAssist 切 java
- [ ] 对照课表主场景手测（增/减/删/撤销/澄清/直达页）

**出口：** 管家主路径不走云函数 ai；行为无明显回归。

**风险最高阶段 — 可子阶段：** M8a 密钥 → M8b 只读 tool → M8c 写 tool+确认闸 → M8d 切流。

---

## M9 — 小程序全量切流与死代码

- [ ] 路由表全部模块 `java`
- [ ] grep 确认产品路径无 `wx.cloud.callFunction`
- [ ] 移除/隔离云开发初始化依赖（app.js）
- [ ] bootstrap / stt / chatProxy：确认无产品引用后标记废弃
- [ ] 更新 `acceptance-checklist` 或本目录验收节
- [ ] 开发者工具完整回归（见下「全量回归」）

**出口：** 干净的「仅 HTTP 后端」客户端。

---

## M10 — 数据迁移、关云开发、上线准备

（可在无用户数据的开发阶段延后；有存量时必做）

- [ ] CloudBase 导出脚本
- [ ] 转换导入 PostgreSQL
- [ ] 图片从云存储迁对象存储
- [ ] 校验计数 / 邀请码 / 订阅
- [ ] 购买服务器：JDK、Docker/原生 Postgres+Redis、反向代理 HTTPS
- [ ] 微信小程序后台配置 request / upload 合法域名
- [ ] 关云函数触发器与文档库计费
- [ ] 监控与备份最低配

---

## 全量回归清单（M9 前至少跑一轮）

### 家庭与人

- [ ] 登录  
- [ ] 创建家庭 / 邀请码加入 / 重复加入拒绝  
- [ ] 多家庭切换  
- [ ] 改名 / 主题 / 成员列表 / 昵称头像  
- [ ] 离开 / 解散与回落 onboarding  
- [ ] 兑换码（若有测试码）/ 权益展示  

### 物资与空间

- [ ] 列表 / 筛选空间 / home 临期  
- [ ] 创建（含单位备注标签日期多图）/ 编辑 / 删除  
- [ ] 批量创建 / 合并  
- [ ] search  
- [ ] 空间 CRUD / 位置 CRUD / 口袋  
- [ ] 标签种子与自建  

### 消息与提醒

- [ ] 家庭消息流文案与地点  
- [ ] 详情最近操作  
- [ ] cursor：回前台无变更不重复狂刷  
- [ ] 订阅授权记录 / 手动检查提醒（能测尽测）  

### AI

- [ ] 无密钥引导  
- [ ] 加密钥掩码  
- [ ] 查询类对话  
- [ ] 写操作确认闸  
- [ ] 删除/合并高风险  
- [ ] page.get 直达  
- [ ] 确认无「说 xxx 就做 xxx」旁路  

---

## 建议实施节奏（向导用）

| 顺序 | 阶段 | 依赖 |
|------|------|------|
| 1 | M0 | — |
| 2 | M1 | M0 |
| 3 | M2 | M1 |
| 4 | M3 | M2（家庭上下文） |
| 5 | M4 | M2 |
| 6 | M5 | M3（有 activity 数据） |
| 7 | M6 | M3/M4 写路径已存在 |
| 8 | M7 | M3 订阅表 + M1 微信客户端 |
| 9 | M8 | M3+M4+M5 稳定 |
| 10 | M9 | M1–M8 |
| 11 | M10 | 有服务器 / 有存量时 |

**原则：** 每一阶段结束只增加「可切换模块」，保持云函数对其余模块可用，直到 M9。

---

## 进度日志（实施时追加）

| 日期 | 阶段 | 摘要 | 作者 |
|------|------|------|------|
| 2026-09-30 | M0 | 骨架与计划文档落地 | Agent |
| 2026-09-30 | M0 | Dockerfile + compose `api`；文档改为只需 Docker | Agent |
