## Why

线上数据目前只能靠登录服务器开 `psql` 手写 SQL 才能看到。2026-10-24 实际查了一次：27 个注册用户里只有 8 个进了家庭，7 个家庭里 6 个是 0 物资空壳，真实在用的只有 1 个。这些数字此前没有任何界面可看，全靠临时敲命令，口径也无法复用。

需要把「看数」做成常态能力：一个只读的运营看板，浏览器打开就有数，不用连库、不用记 SQL。

## What Changes

- 新增**只读聚合接口** `GET /admin/api/overview`：一次返回总览、家庭健康分布、家庭列表、近 30 天趋势。
- 指标按「看完能做什么决定」筛过一轮：去掉累计操作数、图片数、空间分布；家庭数拆成活跃 / 沉默 / 空壳；趋势第三线从「操作数」换成「活跃用户（去重）」。
- 新增**同域静态看板页** `/admin/`（单文件 HTML，无构建、无外链、无 npm），输入令牌后展示。
- 新增配置 `ADMIN_DASHBOARD_TOKEN`（Bearer 静态令牌）。未配置时接口一律拒绝，避免「忘配 = 裸奔」。
- 路径**不使用 `/api/` 前缀**：天然绕开小程序会话过滤器，也不会进入 AI 管家能力表。

## Capabilities

### New Capabilities

- `admin-dashboard`: 运营只读看板——独立鉴权、只读聚合、不含 openid 的统计口径，与小程序业务面完全隔离。

### Modified Capabilities

无。不修改任何现有能力、写路径或数据结构。

## Non-Goals

- 不做备份/恢复（另立项；`pg_dump` 属于数据库侧，与本看板无关）。
- 不做管理员账号体系（多运营人员/审计需求出现时再做）。
- 不做前端框架、图表库、CDN 依赖。
- 不新增 Flyway 迁移、不加表、不加索引。

## Impact

- 服务端：新增 `modules/admin/{api,app,auth,config,infra}` 五个文件 + `resources/static/admin/index.html`。
- 配置：`server/docker-compose.yml` 增加一行 `ADMIN_DASHBOARD_TOKEN` 透传（与既有 `ADMIN_OPENIDS` 同一写法）。
- **不改**：`AuthFilter` / `RequestContext` / `SessionService` / 任何 `/api/**` 路由 / `ai_capabilities` 种子 / 小程序代码 / 表结构。
- 部署：需重建一次 api 镜像；不部署则仅本地可用。
