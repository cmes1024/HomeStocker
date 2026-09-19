## 1. Domain write

- [x] 1.1 在 `item/service.js` 与 `ai/itemService.js` 实现 `createMany`（校验全过 → 批量 `items.add` → 批量 `activities.add`；跳过无意义 expireSub remove）
- [x] 1.2 `item/index.js` 增加 `case 'createMany'`
- [x] 1.3 `collections.md` 记录 `createMany` action

## 2. Assistant tool

- [x] 2.1 新增 `tools/itemCreateMany.js` 并注册 registry；`wrote` 识别 many
- [x] 2.2 `capabilities.js` version+1，启用 `item.createMany`
- [x] 2.3 `promptAssist.js` version+1：≥2 件优先 many；补示例
- [x] 2.4 `draftFromCalls` 支持从 createMany 首条抽草稿

## 3. Verify

- [x] 3.1 对照验收：多件 many、非法零写、单件 create 仍可用（见下方清单；真机部署后手测）

### 验收清单（部署 `item` + `ai` 后）

1. 助手：「在厨房加牛奶、在客厅加纸巾」→ 计划应为一步 `item.createMany`；库出现 2 条 items + 2 条 create activities。
2. `createMany` 含未知空间名 → 零写入 + 失败文案。
3. `items` 空或 >20 → 零写入。
4. 单件「记一瓶牛奶」仍可用 `item.create`。
5. 首次 `ai.act` 后 `aiCapabilities.version` ≥ 8、`aiPrompts.assist-act-v2.version` ≥ 23。
