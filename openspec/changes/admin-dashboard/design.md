## Context

现有鉴权只有一条链路：`AuthFilter` 拦 `/api/**`，用 `X-HS-Token` 换 Redis 里的 `SessionRecord`（openid）。`X-HS-Token` 由小程序 `wx.login` 之后下发，浏览器拿不到，也不该为看板去模拟小程序登录。

数据量级：27 用户 / 7 家庭 / 98 物资 / 456 条活动（2026-10-24）。全表 `count(*)` 都是毫秒级，不需要缓存、物化视图或异步任务。

## Decisions

### D1：鉴权用独立 Bearer 静态令牌，不复用微信会话

- 备选 A（复用 `ADMIN_OPENIDS` + `X-HS-Token`）：浏览器拿不到 token，需要人工从小程序抓，体验不可用。
- 备选 B（独立管理员账号表 + 密码 + session）：只读场景，成本远大于收益，且违反仓库「新能力默认 YAGNI」。
- 选定：`ADMIN_DASHBOARD_TOKEN` + `Authorization: Bearer`，constant-time 比较（`MessageDigest.isEqual`）。
  - 未配置时返回 `503 DASHBOARD_DISABLED`，而不是放行。
  - 令牌只存在 `.env`，轮换 = 改配置重启，可随时吊销。

### D2：路径用 `/admin/api/**`，不用 `/api/**`

`AuthFilter.shouldNotFilter` 只对 `/api/` 前缀生效。放在 `/admin/api/` 下：

- 不需要修改 `AuthFilter`（现有文件零改动，降低回归风险）。
- 不会与小程序任何 action 路径冲突。
- `CORS` 只对 `/api/**` 配了映射，但看板页与接口同源（都由同一个 Spring Boot 提供），不需要 CORS。

代价：路径不符合 `/api/{module}/{action}` 约定。这是有意的——运营面与业务面分离，比统一前缀更重要。

### D3：单一聚合接口，而非多个维度接口

数据量小，一次请求拿全量最省事；同时保证各卡片用同一时刻的快照，避免「注册数按 A 时刻、物资数按 B 时刻」的口径漂移。留在 `AdminDashboardRepository` 一处定义，将来拆接口不影响口径。

### D4：不进 AI 管家能力表

`CapabilityCatalog` 的能力清单来自静态资源 `ai/capability-seed-v46.json`，**不扫描 Controller**。所以新增 Controller 天生不会被 `ai.act` 收录。本 change 不修改该 JSON，也不修改 `CapabilityCatalog.CAPABILITY_VERSION`。

### D5：口径约束

- `users` 表**没有 `created_at`**，只有 `updated_at`（每次登录刷新）。因此「每日新增注册」不可得，趋势图用 `memberships.joined_at`（新成员）、`items.created_at`（新物资）、`activities.created_at`（操作数）。
- 「近 7 天登录」用 `users.updated_at`，语义可靠：`UserRepository.upsertOnLogin` 每次登录都会 `updated_at = now()`。
- `item_expire_subs` 是「人 × 物资」，可能大于物资总数，所以不画百分比条，只给绝对值。
- 不返回 `openid`，家庭 id 只给前 8 位。

### D6：指标取舍原则（2026-10-24 复盘后调整）

判断标准是「看完这个数字能不能做出一个动作」。据此：

- **删**：累计操作数（只增不减，不反映当下）、图片数（与覆盖率重复）、空间分布（知道厨房物资多没有任何后续动作）。
- **拆**：把「家庭数」拆成活跃 / 沉默 / 空壳。7 个家庭这个数字会骗人——实际只有 1 个在用，拆开才看得出空壳占比。
- **换**：趋势第三线由「操作数」换成「活跃用户（去重）」。活动行数与物资操作数高度重合，去重人数才代表「有多少人真的在动这个家」。
- **加**：多家庭成员（多家庭是核心设计）、7 天内过期物资（提醒功能的载荷）、已订阅提醒物资数（订阅入口有没有人点）。

分类口径统一用 7 天窗口：`empty` 优先于 `active`（0 物资的家庭即使有活动记录也不算活跃）。

### D7：只读保证

- 全部查询在 `AdminDashboardRepository`，只有 `SELECT`。
- 不注入 `JdbcTemplate.update` 路径、不写 `activities`、不碰 `flyway_schema_history`。
- 无 `@Transactional` 写事务；单条查询各自一致。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 静态令牌泄露 = 全量统计泄露 | 只返回聚合值，不含 openid / 物资明细 / AI 密钥；令牌可随时轮换 |
| 令牌写进 URL 会进 Nginx 日志 | 一律走 `Authorization` 头，不支持 query 参数 |
| 页面公开可访问但没有数据 | 页面本体不含数据；数据必须带令牌取 |
| 看板 SQL 拖慢主库 | 数据量级小；`LIMIT` 已加；后续若增长可加缓存 |
| 家庭名含 HTML 特殊字符 | 前端一律 `textContent`/转义，禁止直接 innerHTML 插值 |

## Migration

无数据迁移。新增一个可选环境变量；不配则看板不可用，业务不受影响。
