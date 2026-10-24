## 1. 后端只读接口

- [x] 1.1 `AdminDashboardRepository`：总览计数 / 家庭健康三段 / 家庭列表 / 近 30 天趋势，全部 `SELECT`
- [x] 1.2 「无家庭」由 `users - inFamily` 推出，不额外查；`item_expire_subs` 只给绝对值
- [x] 1.3 `DashboardService` 聚合 + 口径说明（notes）；不返回 openid，家庭 id 截 8 位
- [x] 1.4 `AdminDashboardController` 暴露 `GET /admin/api/overview`，响应走既有 `ApiResponse`
- [x] 1.5 未改 `AuthFilter` / `RequestContext` / `SessionService` / 任何 `/api/**` 路由
- [x] 1.6 指标按「能否指导动作」筛过一轮：删累计操作数、图片数、空间分布；家庭数拆活跃 / 沉默 / 空壳；趋势第三线改「活跃用户（去重）」；新增多家庭成员、7 天内过期、已订阅提醒物资

## 2. 独立鉴权

- [x] 2.1 `AdminDashboardAuthFilter` 只匹配 `/admin/api/**`，`Authorization: Bearer`
- [x] 2.2 `ADMIN_DASHBOARD_TOKEN` 未配置 → `503 DASHBOARD_DISABLED`；令牌不符 → `401`
- [x] 2.3 constant-time 比较（`MessageDigest.isEqual`），令牌不进 URL
- [x] 2.4 `docker-compose.yml` 增加一行变量透传（唯一改动的现有文件，不涉业务逻辑）

## 3. 看板页面

- [x] 3.1 `resources/static/admin/index.html`：单文件、无外链、无 npm、深浅色自适应
- [x] 3.2 令牌闸门：未设置时弹输入框，存 `localStorage`，401/503 时自动重开门
- [x] 3.3 卡片 / 漏斗 / 家庭健康 / SVG 趋势 / 家庭表（含状态徽标与创建时间）全部渲染
- [x] 3.4 家庭名等用户输入一律转义，禁止 innerHTML 直接插值
- [x] 3.5 `/admin` 与 `/admin/` 都落到页面（`AdminDashboardWebConfig`）
- [x] 3.6 `<link rel="icon" href="data:,">` 避免浏览器请求 favicon（既有 `GlobalExceptionHandler` 会把 `NoResourceFoundException` 记成 500）

## 4. 本地验证（2026-10-24，本地 Docker 栈 hs-api:8080）

- [x] 4.1 镜像构建通过（Docker 内 Maven 编译，无编译错误）
- [x] 4.2 鉴权分支：无令牌 401、错令牌 401、正确令牌 200
- [x] 4.3 接口返回真实数据：7 用户 / 4 家庭 / 66 物资 / 456 活动；空间分布按名称合并（厨房 29、客厅 18）
- [x] 4.4 无头 Chrome 渲染：8 卡片、4 行家庭、5 条空间条、3 条折线，控制台 0 错误
- [x] 4.5 `/admin/` 与 `/admin/index.html` 均 200

## 5. 待办

- [ ] 5.1 线上部署（`deploy/update-server.sh`），`.env` 配 `ADMIN_DASHBOARD_TOKEN`
- [ ] 5.2 线上访问 `https://hs.zfqwjs.com/admin/` 核对数据与本地一致
- [ ] 5.3 `.env.example` 补一行 `ADMIN_DASHBOARD_TOKEN` 说明（本次未改，避免扩大改动面）

## 6. 收尾

- [ ] 6.1 AGENTS.md 增补一行：运营看板 = `/admin`，独立 Bearer 令牌，不进 AI 能力表
- [ ] 6.2 归档 change
