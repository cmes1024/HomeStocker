# packageAi：拍照 + 语音入账

> 目录：`docs/plans/2026-09-16-package-ai-capture/`  
> 日期：2026-09-16  
> 状态：**代码已合入**（归档 `openspec/changes/archive/2026-09-17-package-ai-item-capture/`）。[`验收.md`](./验收.md) 仍未勾，真机验收算第一阶段 AI 收口，不是「还能不能写代码」。  
> 性质：现有物资台账旁边的 **AI 录入支路**，不是对话助手，也不改清单/编辑主路径

家庭场景里，一条条填表进账不现实。这一版用「一张图一行、一行一段语音、核对后再写入」降低录入成本；图只当封面落库，第一版清单不出图。

## 怎么读

按这个顺序即可开工前对齐；实施时以 [`方案.md`](./方案.md) 为准。

| 文件 | 用途 |
|------|------|
| [`讨论过程.md`](./讨论过程.md) | 从想法到定稿的取舍，避免把已否决方案又做回去 |
| [`方案.md`](./方案.md) | **权威技术方案**：边界、动线、数据、云函数、模型、入账、安全 |
| [`实现步骤.md`](./实现步骤.md) | 有序任务；每步可验收 |
| [`验收.md`](./验收.md) | 开发完成后对照的行为清单 |
| [`提示词草稿.md`](./提示词草稿.md) | 写入 `aiPrompts` 的 system 正文，实施时按此落库 |

## 和仓库里其它文档的关系

| 文档 | 关系 |
|------|------|
| [`../2026-09-07-ai-assistant-design.md`](../2026-09-07-ai-assistant-design.md) | 旧 V1：半屏聊天、一句一条、查询 + 简单录入、LangGraph。**本方案不实现那套 UI**；查询对话仍后置。入账仍遵守「页面和 Agent 同一写入口」。 |
| [`../2026-09-10-next-abcd-roadmap.md`](../2026-09-10-next-abcd-roadmap.md) | A/B/C 已完成。本方案是录入旁路，不是对话 UI，也不塞进 C 波。 |
| [`../2026-09-16-cloud-call-cache/方案.md`](../2026-09-16-cloud-call-cache/方案.md) | 入账走现有 `callItem('create')` 即可吃到写作废，**不必为 AI 改 `cloud.js`**。 |
| `miniprogram/cloud/collections.md` | 已含 `familyAiKeys` / `aiPrompts` / `itemMedia` 与控制台检查项。 |
| `agent/` | LangGraph 雏形仍后接。本版抽取是云函数里一次 JSON 调用，不上图循环、不调 tool 写库。 |

## 一句话

用户在 `packageAi` 里把「图 + 话」收成卡片，确认后调用现有 `item` / `space` 云函数写入当前家庭；模型用家庭里配置的 DeepSeek key，由云函数代发。
