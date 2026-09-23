# AI 助手：上下文 / 查库 / prompt 优化

> 日期：2026-09-22  
> 状态：**已落地（发版后按验收.md 烟雾）**  
> OpenSpec：[`openspec/changes/archive/2026-09-22-ai-assist-context-retrieval/`](../../../openspec/changes/archive/2026-09-22-ai-assist-context-retrieval/)

在 V3（history + 查库、无会话袋）之上做三波质量优化，不引入 Jev / lastOps / NL 路由。

## 三波

| 波 | 内容 |
|----|------|
| 1 查库 | 共享关键词检索；probe/search 同源；回执恢复按名；prompt 软句 |
| 2 History | 20 轮内优先保留含 `已改`+`→` 的助手轮（端云对齐） |
| 3 Prompt | 瘦身 + 能力 hint 去重；`assist-act-v3` version 11 |

## 部署

小程序 `packageAiAssist` 与云函数 `ai` **同发**（history 截断规则两端一致；prompt/能力表 version 覆盖）。

## 烟雾验收

见同目录 [`验收.md`](./验收.md)。通过后可 archive OpenSpec change。

## 上游

V3 基线：[`../2026-09-22-ai-assistant-v3/`](../2026-09-22-ai-assistant-v3/)
