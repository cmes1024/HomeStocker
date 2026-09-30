# HomeStocker Server（Java）

用自建 Spring Boot API **完整替代** 微信云开发云函数。小程序仍为前端。

设计与迁移向导（权威）：

[`docs/plans/2026-09-30-java-backend-migration/`](../docs/plans/2026-09-30-java-backend-migration/)

## 当前状态

- **脚手架已建**：包结构、Dockerfile、Compose（含 `api`）、Flyway 基线 DDL、`GET /api/health`
- **业务代码未写**：按迁移路线图分模块实施
- **本机前提**：**只需 Docker**（Desktop 或兼容引擎）。不必安装 JDK / Maven

## 本地一键起

```bash
cd server
# 可选：cp .env.example .env 并填入 WECHAT_APP_ID / WECHAT_APP_SECRET
docker compose up --build
```

首次构建会拉 Maven 依赖，可能较慢。起来后：

```bash
curl http://localhost:8080/api/health
docker compose ps
```

服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| `api` | 8080 | Spring Boot（profile=`docker`） |
| `postgres` | 5432 | 数据库 |
| `redis` | 6379 | 缓存 / 会话 |
| `minio` | 9000 / 9001 | 对象存储与控制台 |

常用：

```bash
docker compose logs -f api
docker compose down          # 停容器，保留数据卷
docker compose down -v       # 连数据一起清（慎用）
```

## 服务器部署

同一套 Compose 即可；另配域名、HTTPS、密钥与备份。见迁移文档 `06` / `07`。无需在服务器装 JDK/Maven。

## 目录

```
server/
  Dockerfile
  docker-compose.yml          # postgres + redis + minio + api
  pom.xml
  src/main/java/com/homestocker/
  src/main/resources/
    application.yml
    application-docker.yml    # Compose 内网主机名
    db/migration/V1__baseline_schema.sql
```

## 可选：本机 JDK 调试

若以后要在 IDE 断点调试，可再装 JDK 17 + Maven，连 `localhost` 上的 Compose 依赖。默认开发路径不需要。

## 密钥

复制 `.env.example` → `.env`（勿提交）。Compose 会自动读 `server/.env`。
