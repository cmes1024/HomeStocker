## Why

AI 助手 V2（`ai.act`）产品意图本就是「模型看业务边界与状态后自己决定怎么做」，但实现里堆了大量意图正则与旁路（结构问答、盘点纠偏、订阅面板短路等），形成半 agent + 半规则引擎，难维护也难预测。需要按标准 agent 结构收口：上下文与 tool 交给模型，代码只组装、执行与守门。

## What Changes

- 将 `ai.act` 收成标准 agent 主路径：**Context → Model（唯一意图入口）→ Tools 或直接答用户**
- 能力表条目封装为 **tool handler**（schema / validate / run / result），执行器按 registry 调度，不再在 `act.js` 里堆 `if (use === …)` 与意图分类器
- **删除或降级** 代码侧意图启发式（结构-only、盘点强制 probe、订阅入口短路等）；等价能力改由 prompt + tool 表达
- 保留且仅保留 **guardrails**：鉴权、能力白名单与硬底线、`confirm` 重放、禁止无探查结果臆造库存、写路径仍走 `itemService` / 现有领域 action
- 不引入 LangGraph / `agent/` 服务 / OpenAI native function-calling 壳；运行时仍在云函数内（允许最多一轮 probe 后再问模型）
- **不做**：改 V1 `packageAi`、改手填表/清单主路径、流式、语音、视觉、自动合并、通用「读/写任意集合」tool

## Capabilities

### New Capabilities

- `ai-agent-runtime`: 标准 agent 控制流（上下文组装、模型计划、tool 运行时、guardrails）及对 `ai.act` 的约束

### Modified Capabilities

- （无主库 `openspec/specs/` 条目；V2 的 `ai-assistant-act` / `ai-capability-registry` 尚未 archive。本 change 以新 capability 收口控制流与 tool 契约，实施时对齐并取代 `act.js` 内旁路行为。）

## Impact

- 云函数：`miniprogram/cloudfunctions/ai/act.js` 拆薄；新增 tool 模块与 registry；`capabilities.js` / `promptAssist.js` 随 tool 契约微调；`itemService.js` 仍为领域写读，不改写模型
- 小程序：`packageAiAssist` 协议（ask / confirm / done / blocks）尽量保持兼容；订阅面板若经 tool 返回，UI 仍展示现有开关面板
- 产品行为：结构/盘点等由模型决策，个别话术路径可能与旧启发式略有差异；删除确认、无密钥、硬底线不变
- 文档：可回写 `docs/plans/2026-09-17-ai-assistant-v2/` 控制流说明；不上 `agent/` LangGraph
