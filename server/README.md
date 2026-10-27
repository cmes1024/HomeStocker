# HomeStocker Server（Java）

用自建 Spring Boot API **完整替代** 微信云开发云函数。小程序仍为前端。

设计与迁移向导（权威）：

[`docs/plans/2026-09-30-java-backend-migration/`](../docs/plans/2026-09-30-java-backend-migration/)

## 当前状态

- **M0**：包结构、Dockerfile、Compose（含 `api`）、Flyway 基线、`GET /api/health`
- **M1**：`POST /api/auth/login|logout|me`、Redis session（`X-HS-Token`）、`ApiResponse` / `FamilyAccess`
- **M2**：`POST /api/family/*` 全 action（建家种子 / 解散清理 / 权益兑换）
- **M3**：`POST /api/item/*` 全 action（activities 旁路 / 临期 home / merge）
- **M4**：`POST /api/space/*`、`/api/tag/*`（family_trees 重建）
- **M5**：`POST /api/activity/list|cursor`（Redis cursor）
- **M6**：`POST /api/storage/presign|remove`（MinIO）
- **M7**：expireNotify 定时（每分钟扫描，按家庭配置的发送时分命中）+ `POST /api/notify/expire/run`
- **M8a**：`POST /api/ai/listKeys|addKey|removeKey|setDefaultKey`（`act` 未迁）
- **运行**：有 Docker 的机器上 `docker compose up --build`；开发机可只写代码、后置联调

## 本地一键起

```bash
cd server
cp .env.example .env   # 填入 WECHAT_APP_ID / WECHAT_APP_SECRET
docker compose up --build
```

首次构建会拉 Maven 依赖，可能较慢。起来后：

```bash
curl http://localhost:8080/api/health
# 登录走真实 code2session（需小程序 wx.login 的 code；默认已关 mock）
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

## 数据库迁移编号（多分支并行必读）

本地 `hs-postgres` 数据卷是**所有分支共用**的，迁移号撞车会让 `api` 直接起不来（Flyway 校验失败，不是业务代码问题）。

新增迁移前，先查库里已用到的最大版本：

```bash
docker exec hs-postgres psql -U homestocker -d homestocker \
  -c "select version, description, success from flyway_schema_history order by installed_rank desc limit 5;"
```

规则：

- **一个版本号只能属于一个分支**。若已有人用过（哪怕那个分支还没合并），改自己的号，**不要**改内容去迁就，也不要 `repair` 覆盖别人的记录。
- 当前号段：`V1`–`V6` 主线；`V7` 归 `feature/voice-call-spike`（`family_voice_settings`）；`V8` 归临期提醒配置。本分支后续从 `V9` 起。
- 迁移脚本尽量写成幂等（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`），方便回切分支时重跑。

两种典型报错：

| 报错 | 含义 | 处理 |
|------|------|------|
| `Migration checksum mismatch for version N` | 该版本号已被别的分支占用，或已应用的文件被改过 | 给新迁移换号，重新 `docker compose build api` |
| `Detected applied migration not resolved locally: N` | 本地库跑过别的分支的迁移，当前分支没有该文件 | 删掉这条孤儿记录（等价 `flyway repair`，只删 history 行，表结构和数据不动）：`docker exec hs-postgres psql -U homestocker -d homestocker -c "delete from flyway_schema_history where version = 'N';"` |

第二条的前提是对方脚本幂等——切回那个分支时 Flyway 会重跑一次。删之前先 `select` 确认是哪一条，别删主线迁移。

## 临期提醒定时任务：容量口径

`ExpireNotifyJob` 默认每分钟 tick 一次（`homestocker.expire-notify.cron`），是否该发由各家庭的 `expire_reminder_hour/minute` 决定。**不要为了「省压力」去降频**，理由如下。

### 扫描不是瓶颈

| 项 | 数值 |
|---|---|
| 频率 | 每分钟 1 次 = 0.0167 QPS |
| 单次查询（4 家庭） | 0.05 ms |
| 单次查询（10 万家庭，`families` seq scan） | 10–20 ms |
| 每天总 CPU（10 万家庭） | ≈ 29 秒（占比 < 0.1%） |

对比：一次 `item.home`（用户刷首页）通常几 ms 到几十 ms。**定时任务跑一整天的成本，约等于一个人刷几次首页。** 降到每 5 分钟只会省下测量误差级别的资源，却让「用户选的 9:07」变成 9:10。

### 真正的重活在发送，不在扫描

每个家庭每天只发一轮：3 类 SQL（当日到期物品 / 授权成员 / 逐物品订阅）+ 订阅人数 × 微信 HTTP（外部 API，单次 50–200 ms）。`@Scheduled` 默认单线程，粗算吞吐 **250–300 家/分钟**。

| 同一分钟命中家庭数 | 表现 |
|---|---|
| < 200（也是 SQL `LIMIT` 边界） | 一轮跑完，无感 |
| 200–500 | 跨 1–2 分钟，仍在 2 小时补发窗口内，用户无感 |
| > 2000 | 明显延迟，需要异步发送 / 分批 |

### 什么时候才该动

看观测，不看猜测：

| 信号 | 阈值 | 动作 |
|---|---|---|
| 日志 `claimed` 常态 | > 200/分钟 | 扫描与发送解耦（扫描只入队） |
| `families` 行数 | > 10 万 | 加 `expire_reminder_enabled` 部分索引或表达式索引 |
| `fail` 持续 > 0 | 任意 | 查微信模板 / 授权，与压力无关 |

在此之前加索引、降频、上消息队列都属于提前优化，只增加维护面。

### 补发窗口语义

`GRACE_MINUTES = 120`：设定时间已过但不超过 2 小时（且不跨午夜）仍会补发；超过则当天不发。订阅记录不会被消费，不会丢，只是当天缺一次提醒。

只有被 `claimExpireNotify` 抢到的家庭才会推进 `expire_notify_last_date`：关总开关、不在窗口内、或已被其他实例抢到的家庭都不会推进，次日照常处理。反之，一旦占位成功，即使随后发送失败也不会当天重试（避免重复推送），需看 `log.warn` 定位。

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

真实 `wx.login`：填入 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`，保持 `WECHAT_MOCK_ENABLED=false`；小程序 `config/index.js` 的 `authUseMockCode` 保持 `false`。

可发内测码：在 `.env` 设 `ADMIN_OPENIDS`（逗号分隔 openid；本地 mock 常用 `local-dev-openid`）。AI 话术联系微信号用 `CAPACITY_ADMIN_WECHAT`（非 openid）。
