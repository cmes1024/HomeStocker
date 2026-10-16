## Why

管家办事的预期不可控：一次调整要同时改提示词、能力说明和编排补丁，改完不知道伤到哪条旧路径。课表核心轨还没有一组固定断言，模型在看见库存之前就要自己记得先查。

## What Changes

- 课表核心轨 C1–C8 收成 `ai-eval` 计划 `curriculum-core`，断言接口与禁止写入；mock 只誊抄，实跑用 `--mode act`
- 问模型之前，按本句里出现的台账物资名召回已有行，写入提示词并分配本轮短号；这是名称重合，不按话术选接口
- 后续把自制 JSON 计划换成原生工具循环（步数封顶）；确认、数量大于 0、硬拒绝仍在代码里。客户端 `ai.act` 的 ask / confirm / done 不变

## Capabilities

### New Capabilities

- `ai-eval-curriculum`: 课表核心轨作为可重复开跑的评测计划，断言工具而不断言人话原文

### Modified Capabilities

- `ai-assistant-act`: 首轮模型调用前注入名称召回事实；工具循环落地后，模型以工具调用办事，而不是一次交齐六通道 JSON

## Impact

- `ai-eval/bank`、`ai-eval/plans/curriculum-core.json`
- `server` 的 `ItemsProbe`、`ActContextBuilder`、`AssistPromptTexts`、`ActPrompt`、`ItemRepository`
- 提示词版本递增，部署后由 `ensurePrompt` 覆盖旧 system
- 写路径、确认卡、小程序协议不变
