## Why

助手一句话批量入账时，模型只能反复调用 `item.create`，云函数内对每件做一次 `items.add` + `activities.add`，往返多、耗时长。云开发文档库支持一次 `add` 写入多条文档；需要把「批量入账」做成正式领域 action 与助手 tool，让模型在 ≥2 件时选更优路径。

## What Changes

- 新增领域写 action `item.createMany`（`itemService` + `item` 云函数）：先全部校验，任一非法则整批不写；通过后一次批量写入 `items`，再批量写对应 `activities`
- 助手能力表启用 `item.createMany`；新增 tool handler；prompt 约定 ≥2 件优先 many，单件仍可用 `item.create`
- **不做**：改 `packageAi` / 手填编辑页；新建空间；合并活动为一条摘要；改临期订阅产品语义

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `ai-capability-registry`：启用并描述 `item.createMany`
- `ai-assistant-act`：多件入账计划可走 `item.createMany`，执行器经现有写模型落库
- `item-ledger`：领域 API 支持 `createMany`（全校验后批量写 items + activities）

## Impact

- 云函数：`item/service.js`、`ai/itemService.js`（双份同步）、`item/index.js`、`ai/capabilities.js`、`ai/promptAssist.js`、`ai/tools/*`
- 小程序：协议兼容；本轮 UI 不调用 `createMany`
- 部署后靠能力表 / prompt 的 version 覆盖，无需手改库文档
