## Context

See `proposal.md` for why. C 波已经在 `item` 云函数成功增删改后旁路写 `activities`，消息行在客户端用 `actorNickname` + 动词 + `itemName`（update 再加 `summary`）拼出来。地点只作为 update 的字段键出现，create/remove 不存空间名。人名已经有：写 `actorOpenid`，列表时 join 昵称，缺省「家人」。

## Goals / Non-Goals

**Goals:**
- 写活动时快照地点名（及 create 的数量单位），读侧用同一套句式
- 旧行不回填、不报错

**Non-Goals:**
- 字段前后对照（「从 1 袋改成 2 袋」）
- 空间/标签 CRUD 进消息
- 新索引；活动 list 仍按现有字段返回整文档

## Decisions

### 1. Snapshot names at write, not ids-only
- **Choice:** 活动文档增加 `spaceName`、`locationName`（可空字符串）；可选同时存 `spaceId` / `locationId` 便于对照，展示只用名称。create 再存 `quantity`、`unit`。
- **Why:** 空间可改名、物资可硬删；消息必须在事后仍能读。名称快照与已有 `itemName` 同一策略。
- **Alternatives:** 读消息时再查 `spaces`/`items`（删除后丢失；多一次读）；只存 id（feed 还要二次解析）。

### 2. After-state place on update
- **Choice:** update 快照的是写成功后的空间/位置。
- **Why:** 「在厨房更新了盐」指改完之后在哪；不必做迁移审计。
- **Alternatives:** 快照改前地点（搬家时更像日记，但和用户给的「在厨房」读法不一致）。

### 3. Compose copy on the client
- **Choice:** 共用 `formatActivityLine`；服务端不写整句 `summary` 覆盖 update 字段摘要。create 动词改为「添加了」以贴近口语。
- **Why:** 文案可改而不重写库；update 仍要「改了哪些项」。
- **Alternatives:** 服务端写死整句（改文案要迁数据）。

### 4. Place phrase
- **Choice:** 空间+位置用 `厨房·冰箱`；只有空间用 `厨房`；都空则不加「在…」。
- **Why:** 用户要位置，例句又常只写房间；间隔点比硬连「厨房冰箱」更不易粘成新词。

## Risks / Trade-offs

- [地点解析失败] → 名称留空，句子退化为无「在厨房」，不阻断物资写。
- [旧活动无新字段] → 拼句跳过地点/数量。
- [空间改名] → 历史行保留当时名称，不跟随改名。

## Migration Plan

1. 更新 `collections.md` 与 `item` 云函数后重新上传 `item`。
2. 小程序端拼句随版本发布；旧云函数写出的行仍可展示。
3. 无需数据回填；回滚即停写新字段，旧拼句逻辑可再兼容缺字段。

## Open Questions

（无）
