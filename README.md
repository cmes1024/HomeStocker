# HomeStocker（存哪儿）

家庭协同物资台账微信小程序。家人建家、记账、分空间放货、看临期、看家庭消息，并用自然语言跟「家庭管家」改库存。

本分支已完成 **云开发 → 自建 Java 后端** 迁移：小程序前端保留，业务读写、鉴权、定时提醒、AI 管家、对象存储全部走 `server/`（Spring Boot），**不再依赖云函数 / 云开发客户端**。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | 微信原生小程序 |
| 后端 | Java 17 + Spring Boot 3.3 |
| 数据库 | PostgreSQL 16 + Flyway |
| 缓存 / 会话 | Redis 7（Session、`X-HS-Token`、cursor、家庭树等） |
| 对象存储 | 本地 MinIO；上线可换 COS/OSS |
| 部署 | Docker Compose（本地与单机服务器同一套；不必本机装 JDK/Maven） |

小程序 → `utils/cloud.js`（读缓存门面）→ `utils/javaApi.js` → `POST /api/{module}/{action}`。身份由服务端 `code2session` 换 openid，客户端不可伪造。

## 已落地能力

- **家庭**：创建 / 邀请码加入、多家庭切换、全员同权；免费档容量限制，兑换码升加强版
- **物资台账**：名称 / 数量 / 单位 / 备注；空间必填、位置可选；多标签；生产/过期日；最多 3 张图
- **空间与位置**：无空间时懒建默认「仓库」；清单可按空间筛
- **保质期**：首页「即将过期」；按人×物资订阅消息（3/1/0 天）+ 家庭总开关
- **家庭消息**：物资增删改写活动流，带空间/位置快照
- **命名主题**：主色 / 副色 / 阴影色，全站 CSS 变量
- **家庭管家（AI）**：`packageAiAssist` + `ai.act`（history + 查库；BYOK；写走同一 `item`/`space`/`tag` 入口，`source: agent`）
- **密钥页**：`packageAi/keys`（家庭 DeepSeek 等，BYOK）

**本阶段不做：** 角色权限、软删除物资本体、评论/@/聊天、ES 搜索、实景 3D、半屏 LangGraph 对话入口。

**第一阶段还剩：** 用户体系验收、首页搜索（搜索栏目前多为装饰）。

## 仓库结构

```
HomeStocker/
├── miniprogram/          # 微信小程序（唯一产品前端）
│   ├── config/index.js   # API 地址、AppId、登录 mock 开关
│   ├── pages/            # 主包：onboarding / items / family
│   ├── packageBrowse/    # 空间、物资详情、口袋
│   ├── packageAi/        # 仅密钥页
│   └── packageAiAssist/  # 家庭管家
├── server/               # Java API（权威后端）
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── src/              # Spring Boot + Flyway
├── ai-eval/              # 管家能力评测题库与 runner
├── docs/plans/           # 设计与实施文档
├── openspec/             # 行为规格与变更
├── agent/                # LangGraph 对话雏形（后置，非本阶段入口）
└── AGENTS.md             # 给 Agent / 协作者的工作约定
```

## 本地快速开始

前提：**Docker Desktop**（或兼容引擎）+ 微信开发者工具。不必本机装 JDK/Maven。

### 1. 启动后端

```bash
cd server
cp .env.example .env
# 编辑 .env：填入 WECHAT_APP_ID / WECHAT_APP_SECRET（与小程序 AppId 一致）
docker compose up --build
```

探活：

```bash
curl http://localhost:8080/api/health
```

| 服务 | 端口 |
|------|------|
| api | 8080 |
| postgres | 5432 |
| redis | 6379 |
| minio | 9000（API）/ 9001（控制台） |

### 2. 连接小程序

1. 开发者工具 → 详情 → 本地设置 → **不校验合法域名**
2. `miniprogram/config/index.js`：`javaBaseUrl` 默认 `http://127.0.0.1:8080`；真机改成电脑局域网 IP
3. `authUseMockCode` 保持 `false`（真实 `wx.login` → 服务端 `code2session`）
4. 改 Java 后重建 API：`docker compose up --build -d api`

更细的联调说明见 [`docs/plans/2026-09-30-java-backend-migration/06-local-dev.md`](docs/plans/2026-09-30-java-backend-migration/06-local-dev.md)。

## 服务器部署（单机 Docker）

与本地同一套 Compose：**机器上只需 Docker**，不必装 JDK/Maven。公网域名、HTTPS、微信合法域名属上线运维（M10），细节勾选见 [`07-cutover-checklist.md`](docs/plans/2026-09-30-java-backend-migration/07-cutover-checklist.md)。

### 1. 拉代码并配置密钥

```bash
# 在服务器上
git clone <本仓库> && cd HomeStocker/server
cp .env.example .env
```

编辑 `server/.env`（勿提交 git），至少填写：

| 变量 | 说明 |
|------|------|
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 与小程序 AppId 一致；`WECHAT_MOCK_ENABLED=false` |
| `MINIO_PUBLIC_ENDPOINT` | 小程序能访问的图片基址（如 `https://img.你的域名` 或同域反代） |
| `ADMIN_OPENIDS` | 可选；可发内测码的 openid，逗号分隔 |
| `CAPACITY_ADMIN_WECHAT` | 可选；管家话术里引导用户加的微信号 |
| `EXPIRE_SUBSCRIBE_TMPL_ID` | 临期订阅消息模板 ID |

### 2. 启动整栈

```bash
docker compose up --build -d
curl http://127.0.0.1:8080/api/health   # 期望含 "ok": true
docker compose ps
docker compose logs -f api              # 排障
```

改代码或改 `.env` 后重建 API：

```bash
docker compose up --build -d api
# 仅改环境变量且镜像未变时：
docker compose up -d api --force-recreate
```

### 3. HTTPS 与微信后台

1. 用 Nginx / Caddy 等把 `https://api.你的域名` 反代到本机 `8080`
2. 图片：`MINIO_PUBLIC_ENDPOINT` 须对小程序可达（同域反代或单独图床子域；**不占** request 合法域名）
3. 微信公众平台 → 开发设置 → 服务器域名：
   - **request 合法域名**：填 API 主机（如 `https://api.你的域名`）
   - 上传走 `wx.request` → `/api/storage/upload`，一般不必单独配 uploadFile 域名
4. 小程序 `miniprogram/config/index.js` 的 `javaBaseUrl` 改成正式 API 地址后发版
5. 验收：`curl https://api.你的域名/api/health`

### 4. 运维注意

- **备份**：Postgres 数据卷（`hs_pg_data`）需定期备份；Redis 可按会话缓存策略
- **停服**：`docker compose down`（保留卷）；`docker compose down -v` 会清空数据，慎用
- **安全**：生产务必改掉 Compose 里默认的 Postgres / MinIO 口令，并限制 5432/6379/9000/9001 勿对公网裸露
- **关云**：存量云数据 / 关云开发控制台见 M10 清单，本轮代码路径已不依赖云函数

## API 模块一览

与历史云函数 action 名对齐：`auth` / `family` / `item` / `space` / `tag` / `activity` / `bootstrap` / `ai` / `storage` / `notify`。

- 物资写一律走 `item`，成功后旁路写 `activities`
- AI 管家经白名单 tool 调同一写路径
- 请求头：`X-HS-Token`（login 后下发）

服务端细节见 [`server/README.md`](server/README.md)。

## 迁移状态

| 阶段 | 状态 |
|------|------|
| M0–M9 脚手架、鉴权、family/item/space/tag/activity、存储、过期通知、AI、小程序切流 | **代码已齐** |
| Docker 联调验收 | 按本机环境 |
| M10 关云控制台 / 存量数据迁移 / 公网上线 | **运维待办** |

实施向导（权威）：[`docs/plans/2026-09-30-java-backend-migration/`](docs/plans/2026-09-30-java-backend-migration/)

## 文档入口

| 想了解 | 去哪读 |
|--------|--------|
| Agent / 协作者约定 | [`AGENTS.md`](AGENTS.md) |
| 文档地图 | [`docs/README.md`](docs/README.md) |
| 第一阶段产品现状 | [`docs/plans/2026-09-17-phase1-status.md`](docs/plans/2026-09-17-phase1-status.md) |
| Java 迁移路线图 | [`docs/plans/2026-09-30-java-backend-migration/05-migration-roadmap.md`](docs/plans/2026-09-30-java-backend-migration/05-migration-roadmap.md) |
| AI 助手 V3 | [`docs/plans/2026-09-22-ai-assistant-v3/`](docs/plans/2026-09-22-ai-assistant-v3/) |
| 管家排障（禁止 NL 关键词路由） | [`docs/plans/2026-09-23-ai-assist-curriculum/迭代指南.md`](docs/plans/2026-09-23-ai-assist-curriculum/迭代指南.md) |
| 行为规格 | [`openspec/specs/`](openspec/specs/) |
| 管家评测 | [`ai-eval/README.md`](ai-eval/README.md) |

## 许可证

见 [LICENSE](LICENSE)。
