# Java 后端迁移 — 文档索引（实施向导）

> 分支：`feature/java-backend-migration`  
> 日期：2026-09-30  
> 目标：小程序前端保留；**全部云函数退役**；openid 由 Java 调微信 `code2session` 获取；本地可开发联调。

本目录是后续实施的**权威向导**。改后端前先读本页，再按阶段打开对应文档。业务规格仍以 `openspec/specs/` + `miniprogram/cloud/collections.md` + 现有云函数代码为准。

## 读序

| 顺序 | 文档 | 用途 |
|------|------|------|
| 1 | [00-overview.md](./00-overview.md) | 目标、边界、默认选型、成功标准 |
| 2 | [01-architecture.md](./01-architecture.md) | Java 分层、模块、鉴权、写路径原则 |
| 3 | [02-database.md](./02-database.md) | PostgreSQL 表设计与集合映射 |
| 4 | [03-cache.md](./03-cache.md) | Redis + 小程序读缓存 / cursor |
| 5 | [04-api-mapping.md](./04-api-mapping.md) | action ↔ REST **防漏盘点**（按模块分节；**不是一次全迁**） |
| 6 | [05-migration-roadmap.md](./05-migration-roadmap.md) | **分模块实施顺序与勾选（真正干活跟这个）** |
| 7 | [06-local-dev.md](./06-local-dev.md) | 无云服务器时的本地联调 |
| 8 | [07-cutover-checklist.md](./07-cutover-checklist.md) | 双跑、切流、关云开发验收 |

代码脚手架：仓库根目录 [`server/`](../../../server/)。

## 默认选型（已锁定于本方案，变更需改文档）

| 项 | 选择 |
|----|------|
| 语言 / 框架 | Java 17 + Spring Boot 3.3 |
| 数据库 | PostgreSQL 16 + Flyway |
| 缓存 / 会话 | Redis 7（Session + cursor + 家庭树等） |
| 对象存储（本地） | MinIO；上线后 COS/OSS |
| 部署 | **Docker Compose**（本地与单机服务器同一套）；本机/服务器都不必装 JDK/Maven |
| 开发机前提 | **只需 Docker** + 微信开发者工具 |
| AI | 全量迁 Java（与 UI 共用 domain service；禁 NL 关键词路由） |
| 迁移策略 | 模块双跑：小程序按开关切 Java / 云函数 |

## 阶段一览（细节见 roadmap）

0. 脚手架与本地基建（**进行中 / 骨架已落**）  
1. 鉴权（code2session + Redis session）  
2. family  
3. item  
4. space + tag + familyTrees  
5. activity + 读缓存 cursor  
6. 对象存储（替换云存储）  
7. expireNotify  
8. ai（密钥 + act + tools）  
9. 小程序全量切流  
10. 数据迁移 / 关云开发 / 上线准备  

## Agent 约定

- 实施时**按 roadmap 阶段勾选**，不要跳过「唯一写入口」与「禁 NL 路由」。  
- 管家相关改动仍遵守 `docs/plans/2026-09-23-ai-assist-curriculum/迭代指南.md`。  
- 开发与单机部署均以 Docker Compose 为准（不必本机 JDK/Maven）；未购服务器前用本地 Compose + 微信开发者工具验收。  
- 用户未要求不要 commit。
