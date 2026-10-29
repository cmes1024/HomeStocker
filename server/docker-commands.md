# server 常用运维命令

所有命令都要在**包含 `docker-compose.yml` 的目录**（即本目录）执行：

```bash
cd /仓库路径/server
```

容器名（见 `docker-compose.yml`）：`hs-postgres` / `hs-redis` / `hs-minio` / `hs-api`。

---

## 1. 查成员 openid

优先用 `docker exec` 直连容器，不依赖当前目录：

```bash
docker exec -i hs-postgres psql -U homestocker -d homestocker -c "select m.family_id, f.name as family, m.openid, u.nickname, m.joined_at from memberships m join families f on f.id = m.family_id left join users u on u.openid = m.openid order by m.family_id, m.joined_at;"
```

只看某个家庭：

```bash
docker exec -i hs-postgres psql -U homestocker -d homestocker -c "select m.openid, u.nickname from memberships m left join users u on u.openid = m.openid where m.family_id = '家庭id';"
```

先列家庭拿 id：

```bash
docker exec -i hs-postgres psql -U homestocker -d homestocker -c "select id, name, owner_openid, member_count, invite_code from families order by created_at;"
```

查某个人所在的所有家庭：

```bash
docker exec -i hs-postgres psql -U homestocker -d homestocker -c "select family_id from memberships where openid = 'oXXXX';"
```

> `users.nickname` 默认是空串，为空只代表用户没填昵称，以 `openid` 为准。
> openid 是完整值，不要用小程序页面上的短 id（前 8 位）。

用 compose 写法（在 `server/` 目录内）等价，建议加 `-T`：

```bash
docker compose exec -T postgres psql -U homestocker -d homestocker -c "select openid from memberships order by family_id;"
```

---

## 2. 管理员白名单 ADMIN_OPENIDS

来源：环境变量 → `application.yml` 的 `admin.openids` → `EntitlementService.isCapacityAdmin`。
支持多个，英文逗号 / 中文逗号 / 空白分隔；单数 `ADMIN_OPENID` 为兼容回退。

查看容器内实际生效值：

```bash
docker compose exec api printenv ADMIN_OPENIDS
```

查看 compose 插值结果（不启动容器，能看出 `.env` 是否读到）：

```bash
docker compose config | grep -A2 ADMIN
```

改完 `.env` 后生效（**必须重建，`restart` 无效**）：

```bash
docker compose up -d --force-recreate api
```

验证某个 openid 是否已是管理员（用该用户登录后的 token）：

```bash
curl -s -X POST http://127.0.0.1:8080/api/family/page \
  -H "Content-Type: application/json" \
  -H "X-HS-Token: 你的token" -d '{}' | grep -o '"isAdmin":[a-z]*'
```

或直接验证发码权限：

```bash
curl -s -X POST http://127.0.0.1:8080/api/family/listRedeemCodes \
  -H "Content-Type: application/json" \
  -H "X-HS-Token: 你的token" -d '{"status":"unused"}'
```

`isAdmin` 每次请求实时计算，**不需要重新登录**。

`ADMIN_OPENIDS` 是平台级运营权限（发内测码 / 查已发码 / hosted 密钥管理），与家庭内 `owner` 无关。

---

## 3. 改 `.env` 的正确姿势

`.env` 被 `.gitignore` 排除，只在所在机器生效：

- 本地 `server/.env` 是开发配置，**不要整份覆盖到服务器**，会冲掉 `WECHAT_APP_SECRET` / `MINIO_PUBLIC_ENDPOINT` 等。
- 线上只改对应那一行（Remote-SSH 编辑，或在服务器上 `sed`）。

```bash
# 在目标机器上
sed -i 's|^ADMIN_OPENIDS=.*|ADMIN_OPENIDS=oAAA,oBBB|' .env
grep ADMIN_OPENIDS .env
docker compose up -d --force-recreate api
```

原来没有这一行时用追加：

```bash
echo 'ADMIN_OPENIDS=oAAA,oBBB' >> .env
```

---

## 4. 健康与日志

```bash
curl -fsS http://127.0.0.1:8080/api/health
docker compose ps
docker compose logs api --tail 80
docker compose logs api -f
```

---

## 5. 常用数据核对

```bash
docker exec -i hs-postgres psql -U homestocker -d homestocker -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM families) AS families, (SELECT count(*) FROM memberships) AS memberships, (SELECT count(*) FROM items) AS items, (SELECT count(*) FROM spaces) AS spaces;"
```

---

## 6. 常见报错

| 报错 | 原因 | 处理 |
|------|------|------|
| `no configuration file provided: not found` | 当前目录没有 `docker-compose.yml` | `cd` 到 `server/`，或改用 `docker exec -i hs-postgres ...` |
| `extra command-line argument "..." ignored` | 命令用了 `\` 续行把 `-c` 的参数拆开，SQL 变成位置参数 | 写成一行；要多行用 heredoc |
| `psql: error: connection to server ... failed` | postgres 容器未起 | `docker compose ps`、`docker compose up -d postgres` |
| 改了 `.env` 但不生效 | 用了 `docker compose restart` | 改 `up -d --force-recreate api` |
| `FORBIDDEN 无权限` | 当前 token 的 openid 不在白名单 | 先 `printenv ADMIN_OPENIDS` 核对完整 openid |

多行 SQL 用 heredoc，避免续行问题：

```bash
docker compose exec -T postgres psql -U homestocker -d homestocker <<'SQL'
select m.family_id,
       f.name as family,
       m.openid,
       u.nickname
from memberships m
join families f on f.id = m.family_id
left join users u on u.openid = m.openid
order by m.family_id;
SQL
```

---

## 7. 不要做的事

- 不要 `docker compose down -v`：`-v` 会删数据卷（`hs_pg_data` / `hs_minio_data`）。
- 不要把 `.env`、dump 文件提交进 git。
- 线上不要用 `docker compose restart api` 施加环境变量变更。
