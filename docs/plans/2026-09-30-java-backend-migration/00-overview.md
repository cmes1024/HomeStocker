# 00 — 概述与边界

## 1. 要解决什么

微信云开发（云函数 + 文档库 + 云存储）成本与运维绑定过紧。迁到自建 Java 服务后：

- 小程序**继续**做唯一产品前端  
- 业务读写、鉴权、定时提醒、AI 管家、文件元数据全部走 Java  
- **不再使用任何云函数**（含 `ai` / `expireNotify` / `stt` / `chatProxy` / `bootstrap`）

## 2. 非目标（本迁移不做）

- 不做角色权限、软删除物资本体、ES、3D/实景（仍属产品后置）  
- 不复活 `pages/chat` / LangGraph 半屏为产品入口  
- 不在本阶段把小程序改成 H5/App  
- 不强制第一天就有公网服务器（本地 Docker 联调优先）

## 3. 成功标准

1. 小程序主路径（onboarding → 建家/加入 → 清单 → 详情 → 家庭页 → 消息 → 管家）在**不调用云函数**下可用  
2. openid 仅由服务端 `code2session` 得出，客户端不可伪造身份  
3. 写路径仍单一：`item` / `family` / `space` / `tag`（及 AI tool 调同一层）  
4. 云开发文档库 / 云存储 / 云函数可关闭且无回归依赖  
5. 本地：`docker compose` + Boot 可起；`/api/health` 与登录探活可通过  

## 4. 对照权威源

| 主题 | 来源 |
|------|------|
| 集合与索引语义 | `miniprogram/cloud/collections.md` |
| 行为合同 | `openspec/specs/` |
| 现状能力 | `docs/plans/2026-09-17-phase1-status.md` |
| 读缓存 | `docs/plans/2026-09-16-cloud-call-cache/` |
| 容量兑换 | `docs/plans/2026-09-21-capacity-membership-redeem/` |
| AI V3 / 查库 | `docs/plans/2026-09-22-ai-assistant-v3/`、`...context-retrieval/` |
| 管家排障 | `docs/plans/2026-09-23-ai-assist-curriculum/迭代指南.md` |
| 现网实现 | `miniprogram/cloudfunctions/*` |

Java 侧表结构 / Redis / API 以本目录文档为准；若与云函数细节冲突，**先对齐产品合同再改代码**，并回写本目录。

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| AI 行为回归 | 最后迁；对照课表与验收清单；禁 NL 路由 |
| 双跑状态不一致 | 模块级开关；同一 openid；写只打一侧 |
| 图片 fileID 与对象存储 | 迁移期双写或懒迁移；API 返回可展示 URL |
| 无公网无法验订阅消息 | 本地先验拼装与名单查询；真机推送购机后补 |
| 本机无 Docker | M0 仅要求安装 Docker；JDK/Maven 由镜像构建，不必本机安装 |
