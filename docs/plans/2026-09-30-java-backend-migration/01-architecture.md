# 01 — Java 架构设计

## 1. 总览

单体 Spring Boot 应用（`server/`）。当前体量不拆微服务。

```
微信小程序
    │  HTTPS (本地调试可 HTTP + 不校验域名)
    ▼
Controller (api)  ── 统一信封 ApiResponse / 错误码
    │
AuthInterceptor / Filter
    │  Header: X-HS-Token → Redis session → openid
    │  解析 users.current_family_id + membership 校验
    ▼
Application Services（按模块，对应云函数 action）
    │
    ├── Domain rules（权益、家庭隔离、activities 旁路、树失效）
    │
    ├── Infra: PostgreSQL (Spring Data JDBC / JDBC Template)
    ├── Infra: Redis
    ├── Infra: WeChatClient (code2session, subscribeMessage)
    ├── Infra: ObjectStorage (MinIO → COS)
    └── Infra: LlmClient (DeepSeek BYOK)
```

定时任务与 HTTP 同进程：`ExpireNotifyJob`（替代 `expireNotify` 云函数）。

## 2. 包结构（已脚手架）

```
com.homestocker
  HomeStockerApplication
  auth/                 # login, session, principal
  common/               # ApiResponse, ErrorCodes, FamilyContext
  modules.family/
  modules.item/
  modules.space/
  modules.tag/
  modules.activity/
  modules.ai/           # keys + act + tools + knowledge + pages
  modules.notify/
  infra/                # redis, wx, storage, llm, jdbc
  support.web/          # health
```

每个业务模块建议内部分层（实施时按需建类，勿过早抽象）：

- `api` — Controller + Request/Response DTO  
- `app` — `*Service` 用例（一个 action 一个主方法或清晰分组）  
- `domain` — 仅必要时抽纯规则  
- 仓储接口可放模块内，实现放 `infra`

## 3. 硬约束（从云函数继承）

1. **身份**：只信服务端 session 中的 openid；不信任 body 里的 openid/family 伪造。  
2. **家庭隔离**：写读均校验 membership；当前家庭来自 `users.current_family_id`（可被 switch 修改）。  
3. **唯一写入口**：物资只经 `ItemService`；空间/位置经 `SpaceService`；标签经 `TagService`；AI tools **必须调用上述 Service**，禁止平行 SQL。  
4. **activities**：仅 item 写成功后旁路插入；插入失败不回滚物资写；列表截断按 `activityLimit`。  
5. **source**：`ui` | `agent`。  
6. **AI**：禁止自然语言关键词路由（正则把「撤销/各减」映射成固定 calls）。允许短号解析、白名单、确认闸、空计划兜底、执行回执。  
7. **客户端直写 DB**：永不开放；小程序只打 HTTP API。

## 4. 鉴权流

```
小程序 wx.login → code
POST /api/auth/login { code }
  → WeChat jscode2session
  → upsert users(openid)
  → Redis SET sess:{token} = { openid, ... } TTL
  ← { token, openid, user... }

后续请求 Header: X-HS-Token: <token>
```

可选：同时返回 `openid` 仅供展示；**授权判断只看 session**。

解散/离开后清理相关 Redis key（cursor、tree、session 中的 family 缓存字段）。

## 5. API 风格

- 前缀：`/api`  
- 模块：`/api/family/*`、`/api/item/*`、…  
- 迁移友好：路径可接近 `/{module}/{action}`，例如 `POST /api/item/create`，body 对齐原云函数 event 字段，降低小程序改动量。  
- 统一响应建议：

```json
{ "ok": true, "data": { }, "error": null }
{ "ok": false, "data": null, "error": { "code": "NOT_MEMBER", "message": "..." } }
```

错误码优先复用云函数已有字符串码，避免前端大面积改判断。

## 6. 小程序接入层

现状：`miniprogram/utils/cloud.js` 调 `wx.cloud.callFunction`。

目标：

1. 新增 `miniprogram/utils/api.js`（HTTP + token）  
2. `cloud.js` 增加**模块路由表**：`family|item|… → 'java' | 'cloud'`  
3. 写成功作废缓存、回前台 cursor 探活逻辑保留；cursor 改为打 Java  
4. 去掉对 `wx.cloud` 的硬依赖（切流完成后）

## 7. 配置与密钥

| 配置 | 来源 |
|------|------|
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 环境变量，不入库 |
| `ADMIN_OPENID` | issueCodes |
| `EXPIRE_SUBSCRIBE_TMPL_ID` | 默认同现网 |
| DeepSeek key | 库表 `family_ai_keys`（BYOK），接口只回掩码 |
| DB / Redis | `application-local.yml` + docker-compose |

## 8. 观测（本地最低配）

- Actuator `/actuator/health`  
- 业务 `/api/health`  
- 结构化日志：`requestId`、`openid`、`familyId`、`action`  
- AI：记录耗时与确认闸结果，不落明文 apiKey  

上线后再补指标与告警（非本阶段阻塞）。
