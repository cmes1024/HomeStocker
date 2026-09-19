## Why

助手「最优写路径」不能只批量物资。一句话常要建多个空间/位置再入账；`space.create` 仍对助手关闭，位置也无 Many，模型只能拆成多次单步。

## What Changes

- 对助手 **启用** `space.create`；新增 `space.createMany`、`space.createLocationMany`
- 领域写：批量校验后一次 `add` 数组，成功后一次 `touchFamilyTree`
- Prompt：结构优先（空间 → 位置 → 物资），同类 ≥2 用 Many
- **不做**：批量改/删空间；UI 批量建房；万能 batchEverything

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `ai-capability-registry`：启用 space.create；增加 createMany / createLocationMany
- `ai-assistant-act`：最优编排与多步结构写
- `family-spaces`：领域 API 支持 createMany / createLocationMany

## Impact

- 云函数 `space`、`ai`（spaceWrite / locationWrite / tools / capabilities / prompt）
- 产品：助手可新建房间（此前能力边界话术需改）
