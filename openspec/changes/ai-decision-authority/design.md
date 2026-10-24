## Context

302 个介入点的完整盘点在 `docs/plans/2026-10-24-ai-decision-authority-map.md`。本文只回答一件事：**怎么改、按什么顺序改、每步怎么证明没改坏**。

现状的三个根因（不是三个 bug，是三层结构性缺陷）：

1. **没有契约，只有文本**：服务端用 `contains` 猜模型语义；模型读中文错误文案猜服务端意图；客户端按字段名猜服务端语义。每加一个 case 就要加一条规则，规则互相覆盖。
2. **引用没有生命周期**：短号 `P1` 是 `ActContextBuilder.build` 里的 `new LinkedHashMap<>()`，请求级；却被要求跨轮稳定。
3. **行动权与信息量成反比**：模型越承认不确定（`ask`），越被剥夺行动权（`asked → 全部写扣住`）。

## Goals / Non-Goals

**Goals**

- 服务端从「语义裁判」退为「事实审计 + 执行 + 不可逆闸门」。
- 服务端与模型之间改用**结构化回执**通信，不再传中文指令。
- 引用（`ref` / `itemId`）在会话内有确定生命周期。
- 用 `ai-eval/` 建立可量化基线，每批改造都有数字。
- prompt 只保留领域知识，删除为掩盖架构缺陷而写的流程补丁。

**Non-Goals**

- 不引入 LangGraph / 独立 Agent 服务（维持 Java 单进程 `ai.act`）。
- 不改确认闸门的存在性（只改它的文案来源与触发面）。
- 不改物资字段、容量档、订阅、活动日志格式。
- 不做软删除（`item.remove` 仍是硬删）。
- 不追求 prompt 零规则：业务知识必须留在 prompt。

## Decisions

### D1 归属原则（一切争议以此为准）

| 决策性质 | 归属 | 判据 |
|---|---|---|
| 不可逆事实（行数、id、同名几条、用户原话） | 服务端独占，完整不加工 | 模型不能猜；服务端不许替它筛 |
| 可错语义（指哪条、落点能否推、要不要问） | 模型独占 | 服务端无语义能力 |
| 不可逆动作（删、合并、批量移除） | 服务端闸门，只停不判 | 停下要点击；不判断对错 |
| 可逆呈现（表格、颜色、措辞） | 模型提案，服务端只校验合法性 | 错了看得见 |

### D2 provenance 协议（本 change 的核心）

写调用可带 `_src`，声明**每个关键参数的来源**。服务端只做确定性核验，不判断推理对错。

```json
{
  "use": "item.update",
  "ref": "P2",
  "spaceName": "厨房",
  "locationName": "橱柜",
  "_src": {
    "spaceName":    { "from": "inference", "via": "P1" },
    "locationName": { "from": "inference", "via": "P1" }
  }
}
```

**值域与核验矩阵**

| `from` | 必填 | 服务端核验 | 不通过 |
|---|---|---|---|
| `user` | `quote` | `quote` 是否出现在 `groundText`（本句 + 最近 3 条家人发言）中 | `*_UNGROUNDED` |
| `probe` | `via` | `via` 指向的 ref 存在，且该行该字段值等于 `given` | `*_UNGROUNDED` |
| `inference` | `via` | `via` 指向的 ref 存在（**不校验推理是否成立**） | 缺 `via` → `INFERENCE_NO_BASIS` |
| `habit` | 无 | 该槽位存在且值匹配 | `*_UNGROUNDED` |
| `default` | 无 | 直接放行 | — |

**三条硬约束**

1. `groundText` 的窄文本（只认家人发言）**保留**——这正是 `from=user` 的核验基础，不是缺陷。
2. `inference` 只要 `via` 指向真实 ref 就放行。这是把语义权彻底交还模型的代价与收益所在。
3. 未申报 `_src` 的字段按兼容模式处理：只审计不拦截，并记 `audit.noSource` 计数，用于观察覆盖率。

**分阶段启用**：B2 只对 `spaceName` / `locationName` / `quantity` 三个字段要求申报；其余字段留到后续 change。

**落点**：`PlaceGrounding` 与 `WriteGrounding` 的返回值语义从「拒绝理由」改为「审计结论」，由 `ActToolLoop.applyBatch` 决定拦截与否。

### D3 结构化错误回执

`appendToolMessage` 不再写中文指令，改写紧凑 JSON：

```json
{"ok":false,"code":"PLACE_UNGROUNDED","field":"spaceName","given":"厨房",
 "declared":"user","quote":"放一起","candidates":["厨房/橱柜","厨房/冰箱"]}
```

错误码目录（首批）：

| code | 含义 | 关键字段 |
|---|---|---|
| `PLACE_UNGROUNDED` | 落点来源不可核 | `field`,`given`,`declared`,`candidates` |
| `QTY_UNGROUNDED` | 数量来源不可核 | `field`,`given`,`declared` |
| `REF_UNKNOWN` | 短号不存在或已失效 | `ref`,`knownRefs` |
| `REF_AMBIGUOUS` | 同名多条，需指明 | `name`,`candidates[]` |
| `NAME_NOT_FOUND` | 名称无匹配 | `name`,`suggestions[]` |
| `INFERENCE_NO_BASIS` | `inference` 缺 `via` | `field`,`given` |
| `WRITE_HELD` | 已扣住待确认 | `planId`,`calls` |
| `ASK_REQUIRED` | 信息不足 | `reason`,`options[]` |

约束：单条回执 ≤ 200 字符；`candidates` 最多 5 项；不得包含中文指令句。

### D4 Grounding 从「否决」降为「审计」

| 现状 | 改后 |
|---|---|
| `blocked != null` → `continue`，调用作废 | `_src` 核验失败 → 返回错误码；核验通过 → 执行 |
| 返回「先问放在哪，不要自己挑」 | 返回结构化候选，让模型自己决定问还是做 |
| `WriteGrounding` 拦 `item.update/remove/removeMany` 的字面不符 | 只核验 `_src`；不再比对「本句有没有这个词」 |

**仍保留的硬拦**（不可逆定位）：`item.remove` / `item.removeMany` / `item.merge` 的 `ref` / `itemId` 若 `from=inference`，允许执行但确认卡必须显示「按推断选中，依据 P1」，把判断摊给用户。

### D5 引用生命周期：选 B（`itemId` 一等 + 短号别名）

| 方案 | 做法 | 判定 |
|---|---|---|
| A | `refs` 提到会话级，跨轮保留 | 需会话状态与过期清理，与 `turnId` 幂等层耦合 |
| **B** | 能力表开放 `itemId?`；服务端校验「属本家 + 命中本次查到的集合」；短号保留为别名 | **采纳**：无状态、语义清晰、改动面小 |

配套三条：

1. `ingest` 不再隐藏已见过的行，改为重发（带短号）；代价是每轮约 500 字符，换多轮可靠性。
2. 能力表 `item.remove` / `item.update` 的 `args` 增补 `itemId?`。
3. `ActRefs.lookupRef` 不再「凭 id 查不到就造 stub」，改为返回 `REF_UNKNOWN`。

### D6 行动权边界

| 现状 | 改后 |
|---|---|
| `(isMutation(use) && (asked \|\| holdWrites))` → 全部扣住 | 只 `confirm=true` 扣住；`asked` 不再否决同批写入 |
| 同批 `ask` + write 被判非法 | 允许：先问后写可在本轮闭环 |
| `MAX_STEPS = 4` | 6（多步整理场景需要） |

**保留**：`confirm=true` 的 held、`turnId` 幂等、`planId` 快照逐字比对、预算超时。

### D7 客户端诚实性

1. `onConfirmRemove` 不再伪造 user 气泡「确认删除/确认合并」。确认动作以 `confirmed:true + planId` 表达，不进 history 的 user 角色。
2. `applyResult` 的 `confirm` 分支：`text = [data.lead, title]`，不再用 `text: title` 覆盖模型正文。
3. `done` 分支：优先 `data.reply`，其次 `lead`，最后 `report.lead`。
4. 冷启动恢复不恢复 confirm 卡（维持现状），但恢复时必须告知「有未完成的确认已失效」。

### D8 回归与门禁

| 项 | 规则 |
|---|---|
| 基线 | B0 跑 `release-smoke` / `daily-use` / `day-flow`，结果提交到 `ai-eval/runs/<ts>-baseline/`，作为后续门禁 |
| 通过线 | `release-smoke` 100%；`daily-use` / `day-flow` 不低于基线 |
| 新增题 | 三类必加：① 推断落点一次办完 ② 同名需指明 ③ 多轮短号引用 |
| 防作弊 | 修改任何 `expected` 必须在 `tasks.md` 显式登记并说明理由；禁止放宽断言换通过率 |
| 人工抽检 | 每批随机抽 5 条 run 记录人工复核语气与真实性（防「数字过了体验差」） |

### D9 分批依赖与回滚

```
B0 基线 ── B1 结构化回执 ── B2 provenance ── B3 引用生命周期 ── B4 行动权
                                                      └── B5 客户端（可与 B3/B4 并行）
```

- 每批独立提交、独立合并、独立回滚；不设大爆炸合并。
- B2 必须晚于 B1：没有错误码，模型无法按码修正。
- B4 必须晚于 B3：先修引用，再松开行动权，否则短号错位会被放大。
- 回滚粒度 = 批次；`_src` 是请求内字段，不落库，回滚无需数据迁移。

## Risks

| 风险 | 应对 |
|---|---|
| 模型滥用 `inference` 乱填落点 | B2 上线后统计 `audit.inference` 占比；> 30% 则收窄到「必须 `via` 指向同空间行」 |
| 结构化回执增加 token | 单条 ≤ 200 字符；`candidates` ≤ 5 |
| 短号重发增加上下文 | 每行约 25 字符 × 20 行；与省下的额外 probe 相比为净收益 |
| 旧客户端不带 `_src` | 兼容模式只审计不拦截；B2 期间观察覆盖率再收紧 |
| eval 通过但体感差 | D8 的人工抽检 + 保鲜膜类题必须真实复现原始症状 |
| 删死代码误删活路径 | B0 用全仓 `grep` 复核调用点后再删；逐步验证编译与测试 |
