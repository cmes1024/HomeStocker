# AI 助手 V2：自然语言 + 家庭树 + 能力边界

> 目录：`docs/plans/2026-09-17-ai-assistant-v2/`  
> 日期：2026-09-17  
> 状态：**实施中**（OpenSpec change `openspec/changes/ai-assistant-v2/` 正在落地；密钥不进 git）  
> 性质：相对 **AI V1（拍照录入向导）** 的下一代助手；也不是 09-07 那份半屏 LangGraph 对话

用自然语言管物资（查 / 记 / 改 / 删），模型看见系统能力边界和当前家庭结构后自己出计划；执行器只跑白名单云函数。手填表、清单、详情、现有 `packageAi` 拍照向导行为不变。

## 怎么读

| 文件 | 用途 |
|------|------|
| [`讨论过程.md`](./讨论过程.md) | 从「最大限度用 AI」到本方案的取舍，避免把已否决路径做回去 |
| [`方案.md`](./方案.md) | 叙事技术方案 |
| [`prompt-assist-act-v2.md`](./prompt-assist-act-v2.md) | V2 提示词占位符与源文件指针 |
| [`reply-blocks-design.md`](./reply-blocks-design.md) | 助手回复通用结构化块（lead + blocks/cards）展示设计 |
| [`../../../openspec/changes/ai-assistant-v2/`](../../../openspec/changes/ai-assistant-v2/) | **实施规格**（proposal / specs / design / tasks） |
| [`../../../openspec/changes/ai-assist-agent-runtime/`](../../../openspec/changes/ai-assist-agent-runtime/) | **控制流重构**：标准 agent 循环；模型为唯一意图路由器；无关键词预路由 |

## 和仓库里其它文档的关系

| 文档 | 关系 |
|------|------|
| [`../2026-09-16-package-ai-capture/README.md`](../2026-09-16-package-ai-capture/README.md) | **AI V1**：`packageAi` 拍照分行 + 抽取确认入账。V2 不替换它，新开分包。`item-extract-v1` 仍只服务 V1。 |
| [`../2026-09-07-ai-assistant-design.md`](../2026-09-07-ai-assistant-design.md) | 更早的「对话 V1」：半屏聊天 + LangGraph 工具循环。**V2 不实现那套 UI，也不先上独立 Agent 服务。** 单一写入口（`item` / `space` / `tag`）仍遵守。 |
| [`../2026-09-17-phase1-status.md`](../2026-09-17-phase1-status.md) | 第一阶段地图。V1 录入验收与 V2 助手是两条线；本文不是已验收能力。 |
| `miniprogram/cloud/collections.md` | 现状集合（已含 `familyTrees` / `aiCapabilities`） |
| `agent/` | LangGraph 雏形仍后接。V2 的「模型出计划」跑在云函数 `ai` 里，不是 `agent/` 接真库。 |

## 一句话

新分包里用户打一句话；云函数带上家庭树和能力表请模型出调用计划；代码按白名单执行现有 action，再给操作汇报。控制流为标准 agent 循环（见 `ai-assist-agent-runtime`），**无**意图预路由。
