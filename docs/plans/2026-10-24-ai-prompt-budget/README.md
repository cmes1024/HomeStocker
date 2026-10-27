# AI 管家 prompt / token 预算优化（待做）

> 状态：**未开工**。本文只是方案，代码一行未改。
> 前置：`openspec/changes/ai-decision-authority/`（B0–B6）已落地；prompt v76，2821 字。
> 相关：`docs/plans/2026-09-22-ai-assist-context-retrieval/`（查库召回 / history 保回执 / prompt 瘦身第一轮）。

## 1. 现状（2026-10-24 实测）

| 载荷 | 实测值 | 位置 | 是否每次调用都发 |
|---|---|---|---|
| system 模板 | 2821 字（v76） | `assistPromptTexts.ASSIST_PROMPT_V2` | 是 |
| system 动态块 | 树 / 习惯 / 关注 / 开场台账 / 召回 / 探查 / 回执 | 模板内 `{{TREE}}` 等占位 | 是，每轮变 |
| 工具定义 | 31 条能力，`id+hint+args` 合计 3384 字，加 JSON 包装约 5–6 KB | `capability-seed-v48.json` → `ToolSchemas` | 是 |
| 家庭树 | 库里 JSON 1.1–1.9 KB（渲染后几百字，随空间/位置/标签增长） | `family_trees.tree_json` | 是 |
| 历史 | 客户端最多 20 轮（`HISTORY_LIMIT`） | `transcript.js` + 服务端截断 | 是，逐步累积 |
| 一轮模型调用次数 | 最多 6 步（`ToolSchemas.MAX_STEPS`） | `ActToolLoop.run` | — |
| token 计量 | **无** | `DeepSeekClient` 只读 `choices`，不读 `usage`；库内无用量表 | — |

消息顺序：`system` → 历史 → 本轮 user（`ActToolLoop.seedMessages`）。system 是第一个消息，**它就是前缀缓存的根**。

粗估：单步输入 6–7k tokens，最坏一轮（6 步）接近 40k。此为估算，需 P0 实测替换。

## 2. 问题

1. **整包重发**：每步都把 system 全量 + 31 个工具定义 + 全部历史重发一遍。
2. **前缀缓存几乎必失效**：system 中段嵌着每轮都变的 `{{TREE}}`/`{{FOCUS}}`/`{{SNAPSHOT}}`/`{{RECALL}}`/`{{PROBE}}`/`{{EXEC}}`，第一个动态块之后的内容（含输出规约）每轮都要重新计费。
3. **没有基线**：没有 token 统计，任何"瘦身 X%"都是盲调。

## 3. 不做什么（红线）

- **禁止**按关键词 / 正则判断意图来决定喂哪套 prompt 或哪组工具——这是本轮刚拆掉的 NL 路由，换个位置也不行。
- **禁止**按"消息类型"切多套 prompt 模板（等于把 B6 删掉的分支判断加回来，eval 将无法归因）。
- **不再**砍领域口径（记重规则、量词说法、落点申报、回执码义）。B6 已从 3531 砍到 2821（-20.1%），剩余部分每一条都对着一条失败类型。
- 不动回执结构（`ToolFeedback`）、不动 `confirm` 闸门、不动 `_src` 核验。

## 4. 三项任务（按顺序做，P0 不做完不进 P1）

### P0 计量（零行为变化）

**改什么**
- `DeepSeekClient`：解析响应 `usage`（`prompt_tokens` / `completion_tokens` / 缓存命中字段若有），塞进 `ChatResult`。
- `ActToolLoop`：每步一行日志
  `[ai.act] step=n pt=<prompt_tokens> ct=<completion_tokens> sys=<chars> tools=<chars> msgs=<count>`。
- `ActPrompt`：可选，把 system 各动态块渲染后字数打一行（`[ai.act] prompt blocks tree=.. focus=.. recall=..`）。

**不改**：任何判定、任何回执、任何 prompt 文本。`ChatResult` 只加字段，旧调用方不受影响。

**验证**：178 个单测全绿；三份 plan 通过数与 B6 终验完全一致（16/17 · 34/35 · 3/4）；日志能看到每步 token。

**工期**：0.5 天。产出是**数据**，不是优化。

### P1 前缀布局（不改语义）

**问题**：system 里动态块在中间，导致跨轮缓存从第一个动态块起全部作废。

**改什么**
- 把 system 拆成两段：
  - **稳定段**（逐字节跨轮不变）：角色、边界、回执码义、输出规约、习惯采用规则。
  - **动态段**：今天/家庭名/树/知识索引+正文/习惯文本/关注/开场台账/召回/探查/回执。
- 动态段移到 system **末尾**（`fillAssistPrompt` 拆成 `stablePart()` + `dynamicPart()`，拼接顺序固定）。
- 稳定段内不得出现任何随轮次变化的内容（含日期、条数、家庭名）。

**不动**：动态段内容本身、任何规则文字。

**验证**：
- 同一家庭连续 5 轮对话，稳定段 hash 不变（新增一条单测即可）。
- 三份 plan 通过数不降。
- 若 provider 返回缓存命中字段，命中率应显著 > 0；否则只能看 `pt` 下降。

**收益**：不减少 token 数，但降低计费单价与首字延迟。风险最低的一项。

**工期**：0.5 天。

### P2 工具层级暴露（省 1500–2000 字）

**问题**：问"冰箱还有牛奶吗"也要带着 `item.merge`、`space.createLocationMany`、`habit.upsert` 等 31 条全量定义。

**改什么**
- 常驻 12–15 条：`item.search` / `item.create` / `item.update` / `item.remove` / `item.removeMany` / `present` / `ask` / `page.get` / `habit.list` / `habit.upsert` / `knowledge.search` / `item.createMany`。
- 其余收进一个 `capability.list`（带分组名与一句话描述），模型需要时自己取回完整 schema，服务端仍按白名单校验。
- 参数 schema 从 seed 动态生成，不手工维护第二份。

**绝不做**：服务端按用户句子猜"这轮该给哪些工具"。给什么由模型请求决定。

**验证**：三份 plan 不降；`requiredTool` 相关失败不增加；单轮 input tokens 降 ≥ 15%。

**风险**：模型可能不知道有 `capability.list`，导致该用的工具没取回 → 表现为"能力外拒答"增多。缓解：在稳定段用一行说明它的存在；先在 daily-use 上试跑再上 release-smoke。

**工期**：1 天（含 eval 复跑）。

## 5. 通过线

| 阶段 | 通过线 |
|---|---|
| P0 | 单测全绿 + 三份 plan 与 B6 终验逐题一致 |
| P1 | 稳定段 hash 跨轮不变；三份 plan 不降；`pt` 或缓存命中可量化改善 |
| P2 | `release-smoke` 不降（老 16 题 ≥15 + 保鲜膜题过）· `daily-use` 不降（≥34/35）· `day-flow` 不降（≥3/4）；单轮 input tokens 降 ≥15% |

## 6. 未验证 / 待确认

1. **DeepSeek 前缀缓存的实际折扣与响应字段**：业界说法是自动命中，但本仓库没有任何证据（`DeepSeekClient` 未读相关字段）。P0 之后才能确认。
2. **system 各块的真实体积分布**：现在只有"总 2821 字"，不知道树/召回/习惯各占多少。要 P0 才能测。
3. **31 条裁到 13 条会不会漏用能力**：无证据，需 P2 的 eval 数字。
4. **是否落库用量**（`ai_usage` 表）：建议先只打日志观察一周，确认有分析需求再建表，避免又多一张没人看的表。

## 7. 任务清单（全部未开始）

- [ ] P0.1 `DeepSeekClient` 解析 `usage`，`ChatResult` 加字段
- [ ] P0.2 `ActToolLoop` 每步 token/体积日志
- [ ] P0.3 `ActPrompt` 动态块字数日志（可选）
- [ ] P0.4 单测 + 三份 plan 复跑，确认零行为变化
- [ ] P1.1 `fillAssistPrompt` 拆稳定段 / 动态段，动态段后置
- [ ] P1.2 稳定段 hash 单测
- [ ] P1.3 三份 plan 复跑
- [ ] P2.1 常驻工具集 + `capability.list`
- [ ] P2.2 稳定段加一行说明（不用 NL 路由）
- [ ] P2.3 三份 plan 复跑 + token 降幅统计
