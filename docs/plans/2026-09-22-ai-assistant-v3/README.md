# AI 助手 V3：上下文 + 查库（无会话操作内存）

> 日期：2026-09-22  
> 状态：**已落地**  
> 规格与任务：[`openspec/changes/archive/2026-09-23-ai-assistant-v3/`](../../../openspec/changes/archive/2026-09-23-ai-assistant-v3/)

相对已落地的管家（`packageAiAssist` + `ai.act`）做控制面重塑，**不是**另起写库模型。

## 主路径（定稿）

1. **问题不清 → `ask` 用户**  
2. **数据不清 → 查库**（probe / search / listExpiring）  
3. **不用跨轮操作内存**（废除 `recentItems` 袋；不做 `lastOps` / `aiSessions`）  
4. **对话语义连续**：history 有上限，但截断不得打断「加了什么 / 做了什么」  
5. **Prompt = 软规范**（知识、业务规矩、边界、场景、tool 说明）；硬约束在代码  
6. **严禁**「用户说了 xxx → 代码执行 xxx」

## 怎么读

| 文件 | 用途 |
|------|------|
| OpenSpec `proposal.md` / `design.md` / `tasks.md` | 为何做、怎么做、勾选清单 |
| OpenSpec `specs/*` | 行为合同 delta |
| 画布（可选） | Cursor canvas：`ai-assistant-v3-flow` 流转图 |
| [`../2026-09-17-ai-assistant-v2/`](../2026-09-17-ai-assistant-v2/) | 前代已落地基线；V3 在其上改控制面 |
| [`../2026-09-22-ai-assist-context-retrieval/`](../2026-09-22-ai-assist-context-retrieval/) | **后续优化：** 查库召回 / history 保回执 / prompt 瘦身 |

## 部署

小程序 `packageAiAssist` 与云函数 `ai` **必须同发**（BREAKING：停用 recent 袋作真相源）。

## 手工验收（发版前）

见同目录 [`验收.md`](./验收.md)。要点：

- 各加 1 → 撤销 → 数量回滚（靠 history + 必要时查库）  
- 删指定数量 → 不足则说明  
- 同名歧义会 ask / probe  
- 单轮不会无限 tool 循环；跨家庭写被拒  
