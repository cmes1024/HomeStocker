## Why

创建类写失败后若整单停住，已成功的结构与未写物资需要人肉补；决策应仍由模型做。需要把执行回执回灌场景，最多一轮重编排。

## What Changes

- 创建类失败 → 注入 EXEC（成功/失败/未执行 + 当前树）→ 模型二次计划 → 再执行
- 代码只执行与回报，不静默改挂/降级
- Prompt v25：`{{EXEC}}` + C2 重编排规则
- **不做**：代码内降级决策；失败后额外 search

## Capabilities

### Modified Capabilities

- `ai-assistant-act`：创建失败后最多一轮模型重规划

## Impact

- `ai` 云函数 orchestrator / registry / promptAssist / model
