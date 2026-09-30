# 06 — 本地开发与联调（无云服务器）

## 1. 需要安装的软件

| 软件 | 是否必须 | 用途 |
|------|----------|------|
| **Docker Desktop**（或兼容引擎） | **必须** | 构建并运行 api + Postgres + Redis + MinIO |
| 微信开发者工具 | 联调小程序时必须 | 前端 |
| curl / 浏览器 | 建议 | 探活 |
| JDK / Maven | **不需要** | 已由 Dockerfile 多阶段构建完成 |

**默认路径：本机只装 Docker。**

## 2. 一键启动（含 API）

```bash
cd server
# 可选：cp .env.example .env  # 填 WECHAT_APP_ID / WECHAT_APP_SECRET
docker compose up --build
```

另开终端：

```bash
curl http://localhost:8080/api/health
# 期望含 "ok": true
docker compose ps
```

| 服务 | 端口 |
|------|------|
| api | 8080 |
| postgres | 5432 |
| redis | 6379 |
| minio | 9000（API）/ 9001（控制台） |

MinIO 控制台：`http://localhost:9001`（minioadmin / minioadmin）。bucket `homestocker` 在 M6 再初始化。

改 Java 代码后需重新构建 api：

```bash
docker compose up --build -d api
```

## 3. 小程序连本机

1. 开发者工具 → 详情 → 本地设置 → **不校验合法域名**  
2. API Base：`http://127.0.0.1:8080`（模拟器）或 `http://<局域网IP>:8080`（真机同一 Wi-Fi）  
3. M1 完成后：`wx.login` → `POST /api/auth/login` → 存 token  
4. 模块开关：已迁模块走 HTTP，未迁仍 `callFunction`  

真机：防火墙放行 8080。

## 4. 微信登录在本地是否可行

**可行。** `code2session` 从跑 `api` 容器的机器出网即可。  
密钥放 `server/.env`，不要写进仓库。

订阅消息完整真机链路可等有域名/服务器后再验；本地先测业务逻辑。

## 5. 常用命令

```bash
docker compose logs -f api
docker compose exec postgres psql -U homestocker -d homestocker
docker compose exec redis redis-cli KEYS 'hs:*'
docker compose down       # 停服务，保留卷
docker compose down -v    # 清空本地数据（慎用）
```

Flyway 在 **api 容器启动时**自动跑，无需本机 Maven。

## 6. 与「有服务器」的差异

| 能力 | 本地 Docker | 服务器 Docker |
|------|-------------|---------------|
| 启动方式 | `docker compose up --build` | 同左（可加 prod 覆盖文件） |
| JDK/Maven 装机器上 | 不需要 | 不需要 |
| 域名 / HTTPS / 合法域名 | 开发工具关校验 | 必须配置 |
| 密钥 | `.env` | 环境变量或密钥文件 |
| 备份 | 可选 | Postgres 卷要备份 |

本地阶段足够完成 M1–M9 主体开发与联调。

## 7. 可选：本机 JDK

仅当需要 IDE 断点调试 Java 时再装 JDK 17 + Maven；依赖仍用 Compose 里的 Postgres/Redis/MinIO。非默认路径。
