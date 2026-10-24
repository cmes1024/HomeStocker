# AI 管家决策权归属对照表

> **文档性质：分析基线，不是实施授权。** 本文档记录「现在谁在做这个决定」与「这个决定应该归谁」，供后续逐条决策与勾选；不代表任何一条已获批准修改。
>
> **代码基线：** 分支 `docs/ai-decision-authority-map`，从 `fix/ai-habit-enforcement-contract` 的 `1fc3b56` 切出。文中行号以该提交为准；代码变动后需重新核对。
>
> **核查方式：** 见文末第 6 节，所有条目均可用 `grep -n` 复现。

---

## 0. 问题陈述

管家当前的失败模式不是「模型不够聪明」，而是**决策被切成两半，两边都没有完整信息**：

- 模型看得懂话，但不掌握最终决定权（选哪条、落点怎么推、要不要问，都可能被服务端字面规则否决）。
- 服务端掌握事实和执行权，但没有语义能力（用 `String.contains()` / 正则判断「这句话指的是哪个空间」）。
- 用户看到的文字里，有 40 处模型从未生成过（固定文案顶替）。

### 样本事故（判断依据）

用户：「新加的那卷保鲜膜，跟原来那卷放一起」

| 步骤 | 实际发生 | 谁做的 | 结果 |
|---|---|---|---|
| 1 | 模型推断落点 = 厨房 / 橱柜 | 模型 | 判断正确 |
| 2 | `text.contains("厨房") == false` | 服务端 `PlaceGrounding.one` | 判为「落点不是本句说的」 |
| 3 | 回灌「空间「厨房」不是本句说的，也没有默认落点。先问放在哪，不要自己挑。」 | 服务端 | 调用被丢弃 |
| 4 | 模型被迫 `ask` | 模型（无选择） | 用户被反问一次 |
| 5 | 用户点选后才写入 | — | 一次意图花了两轮 |

模型做对了语义，被一个不具备语义能力的组件判错。这不是孤例，是 48 条同类判断的必然结果。

---

## 1. 判定原则

后续所有条目按这四条判定归属，不再逐条争论：

| 决策性质 | 唯一归属 | 理由 |
|---|---|---|
| **不可逆的事实**：库里有几行、id 是多少、同名几条、用户原话 | **服务端独占，且必须完整不加工** | 模型不能猜；服务端也不该替模型筛 |
| **可错的语义**：这句话指哪一条、落点能不能推、要不要问 | **模型独占** | 服务端没有语义能力，字面规则判必错 |
| **不可逆的动作**：删除、合并、批量移除 | **服务端闸门，只停不判** | 模型可决定「要删」，落库前必须点一次 |
| **可逆的呈现**：表格形状、列、颜色、措辞 | **模型提案，服务端只校验合法性** | 错了用户看得见，不需要双重接管 |

一句话：**服务端供给事实、执行动作、守住不可逆；其余全部归模型。**

---

## 2. 总量统计

| 侧 | 条目 | 分布 |
|---|---|---|
| 决策否决侧（服务端否决 / 替代模型的判断） | **98** | 软否决 19 · 硬否决 21 · 强制改写 33 · 强制分支 11 · 事实裁剪 14 |
| 输出接管侧（服务端 / 客户端改写、顶替、丢弃模型输出） | **204** | 固定文案顶替 65 · 丢弃 28 · 改写 26 · 白名单 24 · 裁剪 23 · 强制分支 20 · 幂等 9 · 降级 9 |
| **合计** | **302** | — |

两个关键子集：

- **48 条**用字面匹配（`contains` / `equals` / 正则）冒充语义判断。
- **40 处**用户可见文字模型从未生成过。

---

## 3. 分层对照

状态取值：`待改`（归属越界，应还权）/ `保留`（归属正确，不动）/ `待定`（需要产品判断）。

### 3.1 语义判断权 —— 全部越界

| # | 决策 | 现在归谁 | 应有归属 | 证据 | 状态 |
|---|---|---|---|---|---|
| 1 | 「放一起」推断成厨房/橱柜 | 服务端 `text.contains("厨房")` 否决 | 模型 | `PlaceGrounding.java:46-60` | 待改 |
| 2 | 这句话有没有指定位置 | 服务端双向 `contains` | 模型 | `PlaceGrounding.java:92-119`、`TreeMatch.java:24-29` | 待改 |
| 3 | 同名两条该改哪一条 | 服务端按 ref 优先级 + `P\d+` 最小 + 括号猜地点 | 模型（只给候选清单） | `ActRefs.java:410-438`、`240-248` | 待改 |
| 4 | 这句话说的是几件 | 服务端正则扫全文数字 | 模型 | `WriteGrounding.java:476-519` | 待改 |
| 5 | 本句可否改保质期 / 标签 | 服务端 `contains("过期"/"标签")` | 模型 | `WriteGrounding.java:215-239` | 待改 |
| 6 | 这句话点到哪些物资 | 服务端子串扫描、长名优先、最多 8 个 | 模型（给全量名） | `NameRecall.java:18-58` | 待改 |
| 7 | 模型说「已记上」是否属实 | 服务端 23 个词 `contains` 判伪造 | 服务端校验 `wrote` 事实；措辞归模型 | `ActToolLoop.java:638-657` | 待定 |
| 8 | 模型这轮是在提问还是下结论 | 服务端看有没有「？吗」 | 模型 | `PlanParser.java:282-290` | 待改 |
| 9 | 短号 `P1` 指哪一行 | 服务端用缓存 + 模糊匹配重绑 | 服务端（事实绑定） | `ActRefs.java:291-299` | 保留 |
| 10 | 无落点时能否由模型自行选 | 服务端禁止，强制反问 | 模型（可选已有空间） | `PlaceGrounding.java:43-44` | 待定 |

### 3.2 行动权 —— 被过度收窄

| # | 决策 | 现在归谁 | 应有归属 | 证据 | 状态 |
|---|---|---|---|---|---|
| 11 | 本轮问过话后还能否写 | 服务端一律扣住（`asked \|\| holdWrites`） | 模型；仅 `confirm=true` 才扣 | `ActToolLoop.java:266-276` | 待改 |
| 12 | 一轮最多几次工具决策 | 服务端硬限 4 步 | 服务端（但阈值偏紧） | `ActToolLoop.java:143-150` | 待定 |
| 13 | 能否边说边写 | 服务端强制清空 `reply` | 模型 | `PlanParser.java:66-68` | 待改 |
| 14 | 能否边问边写 | 服务端强制否决 | 模型 | `ActToolLoop.java:197-204` | 待改 |
| 15 | 超时后是否还有机会 | 服务端直接终止 | 服务端（预算保护） | `ActToolLoop.java:91-93` | 保留 |

第 11、14 条是「一件事问三轮」的结构性根源：模型被迫在「问」与「做」之间二选一。

### 3.3 事实供给 —— 给得不全，且被加工

| # | 决策 | 现在归谁 | 应有归属 | 证据 | 状态 |
|---|---|---|---|---|---|
| 16 | 模型看到多少条历史 | 服务端 20 条 + 单条 800 字 + 优先保留回执 | 服务端，但应告知被截断 | `ActPrompt.java:29,95-97,221-246` | 待定 |
| 17 | 模型看到哪些备注 | 服务端截 40 字 | 服务端 | `ActRefs.java:96-102` | 保留 |
| 18 | 模型看到哪些能力 | 服务端剔除禁用 + 硬禁 12 项 | 服务端 | `CapabilityCatalog.java:22-37,90-110` | 保留 |
| 19 | 落点名是否规范化 | `TreeMatch` 换成树里的规范名 | 服务端 | `ActRefs.java:28-54` | 保留 |
| 20 | 查不到的行怎么表示 | 服务端**凭空构造 stub 行** | 应告知「不在本轮结果里」 | `ActRefs.java:148-154` | 待改 |
| 21 | 工具未返回新行时 | 服务端拿旧缓存行冒充工具结果 | 应如实说明无新增 | `ActToolLoop.java:294-299` | 待改 |
| 22 | 「用户已说不要再问」这一事实 | **完全没有** | 应作为机器事实注入 | 缺失 | 待改 |
| 23 | 上一轮被 blocked 还是被 held | 模型只收到一句中文，无法区分层次 | 应结构化标注原因类型 | `ActToolLoop.java:261-275` | 待改 |

第 22 条直接对应「确认要合并吗？」那次事故：模型不知道用户已明确授权，只能按闸门走；客户端又把模型的话盖掉。

### 3.4 确认闸门 —— 归属正确，必须保留

| # | 决策 | 归属 | 证据 | 状态 |
|---|---|---|---|---|
| 24 | 删除 / 合并需点一次按钮 | 服务端（9 个 `confirm=true` 能力） | `CapabilityCatalog`、`ActToolLoop.java:207-209` | 保留 |
| 25 | 确认内容不许被篡改 | 服务端（`planId` 快照逐字比对） | `AiActService.java:171-180` | 保留 |
| 26 | 同 `turnId` 幂等回放 | 服务端 | `ActTurnReplay.java:70-84` | 保留 |
| 27 | 确认回合不调模型 | 服务端（省 token） | `AiActService.java:161-198` | 保留 |

这 4 条是资产，不在任何改造范围内。

### 3.5 文案 —— 模型被捂住嘴

| # | 决策 | 现在归谁 | 应有归属 | 证据 | 状态 |
|---|---|---|---|---|---|
| 28 | 查询结果怎么说 | 服务端拼「查询：找到 N 件」 | 模型 | `Presentation.java:44` | 待改 |
| 29 | 空结果怎么说 | 服务端「没有找到匹配的物品」 | 模型 | `Presentation.java:26-31` | 待改 |
| 30 | 执行完怎么汇报 | 服务端拼「完成 N 项」 | 模型 | `Presentation.java:161-163` | 待改 |
| 31 | 习惯查询整段回复 | 服务端拼，`present` 强置 null | 模型 | `AiActService.java:307-315` | 待改 |
| 32 | 确认卡上的每一行字 | 服务端固定 | 服务端（安全） | `AiActService.java:1006-1021` | 保留 |
| 33 | 能力边界话术 | 要求模型逐字照抄 | 模型（只约束语义） | `AssistPromptTexts.java:12,14` | 待改 |
| 34 | 降级问句 | 服务端固定，与客户端 `doneEmpty` 逐字相同 | 服务端，但应可区分来源 | `AssistPromptTexts.java:17`、`copy.js:409` | 待定 |

第 34 条的含义：用户无法分辨「模型答不上」与「系统兜底」，两者文案一模一样。

### 3.6 呈现 —— 双重接管

| # | 决策 | 现在归谁 | 应有归属 | 证据 | 状态 |
|---|---|---|---|---|---|
| 35 | 表格列 | 服务端白名单 → 客户端再截 6 列 | 模型提案 + 服务端校验一次 | `PresentResolver.java:603-627`、`index.js:165-252` | 待改 |
| 36 | 说明列内容 | 服务端正则删「暂无 / 未填」、复述则丢 | 模型 | `PresentResolver.java:192-225` | 待改 |
| 37 | 图表颜色 | 服务端固定 12 色，客户端再兜一次 | 服务端（美化） | `PresentResolver.java:388`、`index.js:269-275` | 保留 |
| 38 | 展示类型归一 | 服务端 `bar→bars`、`donut→pie` | 服务端 | `ActToolLoop.java:706-716` | 保留 |
| 39 | 表尾「另有 N 行未展开」 | 服务端拼 | 服务端（信息补充） | `PresentResolver.java:162-164` | 保留 |

### 3.7 客户端 —— 最隐蔽的三处

| # | 行为 | 问题 | 证据 | 状态 |
|---|---|---|---|---|
| 40 | 点确认时用户气泡显示「确认删掉」/「确认合并」，且**作为 user 消息进入下一轮 history** | **伪造用户发言**，模型下一轮会以为自己被授权过 | `index.js:661-662` | 待改 |
| 41 | `confirm` 分支只读 6 个字段，`lead`/`blocks`/`report` 全不读 | 服务端特意塞进去的 `lead` 被丢弃 | `index.js:1001-1036` | 待改 |
| 42 | `done` 分支不读 `data.reply` | 模型收尾话被丢，只显示服务端 `lead` | `index.js:1067-1068` | 待改 |
| 43 | `confirm` 分支 `text: title` 顶替气泡 | 模型这一轮说什么都不显示 | `index.js:1025` | 待改 |
| 44 | 等待 / 开场 / 取消回执全为固定文案 | 模型从未参与 | `copy.js:364,377-379,396,400-401`、`index.js:342-352,682-690,837` | 保留（UI 稳定态） |

第 40、43 条合计，正好构成「说了确认还问」与「模型像听不懂」两个体感问题的完整来源。

---

## 4. 架构腐烂证据

比归属越界更值得先处理的，是架构已经积累了两代逻辑：

| 现象 | 证据 |
|---|---|
| 整个守卫类从未被调用 | `Guardrails.java` 的 `needsConfirm` / `planNeedsUnavailableCapability` / `capabilityLimitAsk` / `inventoryAuthorityForReply` 全仓无调用点，最后一个还是空实现 |
| `AiActService` 21 个方法/方法组无调用点 | `isIdlePlan`、`replyOrProbeFact`、`presentFromStatsReport`、`bindUnresolvedWritesToProbe`、`mergeCreateReports`、`knowledgeFallbackText` 等 |
| 两套逻辑并存 | 死代码是「服务端替模型补事实」，活代码是「模型自己来」——两代叠在同一个 61KB 文件 |
| 同一件事裁三遍 | 表格：`PresentResolver` → `Presentation` → 客户端 `normalizePresent`；正文：`Presentation.lead` → `index.js` 再拼 → `transcript.js` 再删复述行 |
| 双凭据 | `turnId`（`ActTurnReplay`）+ `planId`（`ActPendingPlan`），客户端另维护 `_confirmTurnId` |

结论：不是「模型一块、服务一块」这么简单，而是**旧架构没清理、新架构不敢信任模型**，于是层层加保险，最终 302 个介入点互相打架。

---

## 5. 建议切法

| 切法 | 涉及条目 | 收益 | 风险 |
|---|---|---|---|
| **E. 清理死代码** | 第 4 节全部 | 先让架构可读、可改 | 零（纯删除） |
| **C. 停止伪造用户发言** | #40 | 模型上下文恢复可信 | 低 |
| **A. 语义判断权还给模型** | #1–#8 | 消灭「保鲜膜式」来回 | 低（否决改反馈） |
| **B. 解除「问过就不能写」** | #11、#13、#14 | 多轮问答变一次办完 | 中（需保证 `ask` 那轮不误写） |
| **D. 停止固定文案顶替** | #28–#31、#33 | 模型真正「说话」 | 低 |
| **F. 不动** | #24–#27 | 闸门是资产 | — |

推荐顺序：**E → C → A → D → B**。

E 和 C 零风险、立刻可做；A 是体感改善最大的一刀；B 需要配套测试。

---

## 6. 附：核查方法

```bash
# 语义否决点
grep -n "contains(" server/src/main/java/com/homestocker/modules/ai/agent/PlaceGrounding.java
grep -n "contains(" server/src/main/java/com/homestocker/modules/ai/agent/WriteGrounding.java

# 行动权收窄
grep -n "asked || holdWrites" server/src/main/java/com/homestocker/modules/ai/agent/ActToolLoop.java

# 固定文案顶替（客户端）
grep -n "confirmMergeTitle\|confirmTitle\|doneEmpty\|askTitle" miniprogram/utils/copy.js
grep -n "text: title" miniprogram/packageAiAssist/assist/index.js

# 伪造用户发言
grep -n "confirmMergeYes\|confirmYes" miniprogram/packageAiAssist/assist/index.js

# 死代码（示例）
grep -rn "Guardrails\." server/src/main/java
```

---

## 7. 附：当前不计入统计的失效代码

以下为定义存在但全仓无调用点，**当前不构成实际介入**，改造时应一并清理：

- `Guardrails.java` 全部 4 个方法。
- `AiActService.java`：`isIdlePlan`(385-402)、`withProbeFact`(405-419)、`replyOrProbeFact`(424-470)、`askBeforeAnyInventoryFacts`(473-479)、`claimsInventoryAbsenceWithoutFacts`(481-509)、`presentFromStatsReport`(532-592)、`buildReadOnlyResultNote`(625-659)、`ensurePresentHasFacts`(684-703)、`ensureProbeForUnresolvedWrites`(732-759)、`bindUnresolvedWritesToProbe`(805-851)、`hasUnresolvedItemWrites`(853-876)、`ingestInventoryToProbeRefs`(879-918)、`attachDoneReply(2 参)`(1316-1318)、`mergeCreateReports`(1530-1589)、`concatCalls`(1618-1623)、`isKnowledgeOnlyReport`/`isPageDocOnlyReport`/`collectKnowledgeBodies`/`collectPageBodies`/`knowledgeFallbackText`/`pageFallbackText`(1625-1724)。
