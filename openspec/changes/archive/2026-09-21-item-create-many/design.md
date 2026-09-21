## Context

V2 助手已通过能力表 + `ai.act` tool registry 执行 `item.create` 等。多件入账时模型会输出 N 条 `item.create`，执行器顺序调用 `createItem`，每件多次文档库往返。微信云开发在云函数端支持 `collection.add({ data: [...] })` 一次插入多条。

## Goals / Non-Goals

**Goals:**

- 单一写模型上增加 `createMany`（UI / 助手 / 未来 tool 共用）
- 助手把 `item.createMany` 列为 enabled 能力；模型 ≥2 件优先选用
- 校验全过再写；失败零写入；活动仍一件一日志

**Non-Goals:**

- 接线 `packageAi` 或编辑页批量保存
- 跨集合事务 / 软删除
- 用一条 activity 代替 N 条 create 日志

## Decisions

### 1. API shape

云函数 / service：`{ action: 'createMany', items: [{ name, quantity?, unit?, note?, spaceId, locationId?, tagIds?, productionDate?, expireDate?, expireReminderEnabled?, source? }], source? }`。

助手 tool：`{ use: 'item.createMany', items: [{ name, spaceName, locationName?, ... }] }`；handler 用家庭树收成 id 后再调 service。

上限 **20** 条/批。

### 2. All-or-nothing validation

先解析并校验每一条（名称、数量、空间/位置归属、标签、日期）。任一条失败 → 返回错误、不写 `items` / `activities`。通过后一次 `items.add({ data: docs })`，再用返回 id 列表组装活动，一次 `activities.add({ data: activityDocs })`。

### 3. Expire subs

新建且未开订阅时 **不调用** `itemExpireSubs.remove`。仅当某条 `expireReminderEnabled === true` 且有 `expireDate` 时 upsert。

### 4. Locations

与单条 create 一致：树里没有的 `locationName` 且能力启用时可先 `createLocation`；空间缺失整批失败（不建空间）。

### 5. Duplicate tips

不做 N 次事后 `items.where`；可选提示本批同空间同位置同名冲突。可能重复不阻断写入。

### 6. Dual service files

`ai/itemService.js` 与 `item/service.js` 目前是分叉副本；本 change 两边都加 `createMany`，保持行为一致。

## Risks / Trade-offs

- [Risk] 云开发批量 `add` 返回字段名（`_ids` / `ids` / `id_list`）因 SDK 版本而异 → 兼容多种键；若长度与 docs 不符则报错并记日志（极端情况下可能已写入 items，需运维关注）。
- [Risk] 模型仍可能拆成 N 次 `item.create` → prompt + hint 明确「≥2 用 many」；不强制改写计划。

## Migration

无数据迁移。能力表 / assist prompt 靠种子 version 升高覆盖。
