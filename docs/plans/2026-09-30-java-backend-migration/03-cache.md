# 03 — 缓存设计（Redis + 小程序）

对照已落地：`docs/plans/2026-09-16-cloud-call-cache/方案.md`。

## 1. 分层

| 层 | 位置 | 作用 |
|----|------|------|
| L1 | 小程序 `queryCache` / `cloud.js`（或后继 `api.js`） | 同会话读复用；写作废；回前台探 cursor |
| L2 | Redis（Java） | Session、activity cursor、family tree、热点 meta、限流、短锁 |
| L3 | PostgreSQL | 真相源 |

**物资列表全页默认不进 Redis**（易脏、体积大）。省调用主要靠 L1 + 廉价 cursor。

## 2. Redis Key 规范

前缀：`hs:`

| Key | 类型 | TTL | 写失效 / 更新 |
|-----|------|-----|----------------|
| `hs:sess:{token}` | HASH/JSON | 30d 滑动 | logout / 封禁 DEL |
| `hs:wx:sk:{openid}` | STRING | 按需 | 仅需微信解密能力时存 session_key |
| `hs:fam:{familyId}:act:cursor` | HASH `{id, at}` | 无或不重要 | 每次插入 activity 更新 |
| `hs:fam:{familyId}:tree` | STRING(JSON) | 24h 可 | space/location/tag 结构写 DEL 或重写 |
| `hs:fam:{familyId}:meta` | HASH | 1h 可 | 改名/主题/计数变更更新 |
| `hs:rate:ai:{familyId}` | 计数 | 窗口 | act 入口 |
| `hs:lock:tree:{familyId}` | STRING | 10–30s | 树重建互斥 |

命名禁止塞入 apiKey 等敏感值到 key 名。

## 3. Session

- 登录成功：生成随机 `token`（≥32 字节），写入 Redis。  
- 请求：`X-HS-Token` → 取 openid；可附带 cached `currentFamilyId`（以 DB 为准，缓存仅加速）。  
- 续期：活跃请求滑动续 TTL。  

## 4. activity.cursor（对齐现网）

现网：回前台合并一次 `activity.cursor`，比较 `{ latestId, latestAt }`。

Java：

```
GET /api/activity/cursor
→ 优先读 hs:fam:{id}:act:cursor
→ miss 则 SQL: activities WHERE family_id=? ORDER BY created_at DESC LIMIT 1
→ 回填 Redis
→ 返回 { latestId, latestAt }
```

插入 activity 后**同步**更新 Redis cursor（与 DB 同成功路径）。

## 5. familyTrees

- DB 表 `family_trees` 为持久物化；Redis 为热缓存。  
- space/tag 结构写成功 → 重建树（或标记 dirty 异步重建）→ 写 DB + SET Redis。  
- item 写**不**改树（与现网一致）。  
- AI act 读树：Redis → DB → 三表重绘。

## 6. 小程序 L1 策略（迁移后保留并收紧）

- 读：先 L1；miss / **TTL 过期** 打 Java。  
- 写成功：按策略作废物资域 / 家庭域（复用现策略表）。  
- 回前台：探 Java cursor；变则作废 L1。  
- **短 TTL（额度目标已退役）：** 物资域 15s（`item.*`、`activity.list`、`bootstrap.home`、含物资的 `space` 读）；结构/家庭域 45s（`family.*`、`space.list|listLocations`、`tag.list`）。  
- 家庭页 `onShow` 每次走 `callFamily('page')`（TTL 内仍可命中），避免页面层跳过 load。

空间/标签无 activity 时：本机写作废；家人改名主要靠结构域 TTL，cursor 不扩大保证。

## 7. 明确不做（YAGNI）

- 不用 Redis 做物资全文搜索  
- 不做跨家庭全局大 Key  
- 第一期不上 Redis Cluster  
- 不用二级本地 Caffeine，除非单机 profiling 证明需要  

## 8. 本地运维

```bash
docker compose exec redis redis-cli KEYS 'hs:*'
docker compose exec redis redis-cli GET hs:fam:...:act:cursor
```

测试可 `FLUSHDB` 仅限本地。
