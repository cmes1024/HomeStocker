## Why

管家的失效模式不是「模型不够聪明」，而是**决策权被切碎，两边都拿不到完整信息**：

- 服务端用 `String.contains()` / 正则冒充语义判断（48 处），用固定文案顶替模型发言（40 处）。
- 模型拿得到 20 轮 history，但它的理解进不了仲裁席：闸门只看「本句 + 最近 3 条家人发言」，助手的话被刻意排除。
- 短号 `P1` 是请求级临时量，却被要求跨轮稳定引用；`ingest` 还会隐藏已见过的行。
- 确认回合完全不调模型；客户端点确认时把固定文案当作用户发言写进 history。

结果是「每次改 prompt 和 Java 都是在同一层加规则」：现有 302 个介入点（98 决策否决 + 204 输出接管）互相覆盖，再加一条就会抵消另一条。

完整盘点见 `docs/plans/2026-10-24-ai-decision-authority-map.md`。

更关键的是**没有基线数字**：`ai-eval/` 有 12 个 plan 和 `--mode act` 真跑能力，但从未在改动前记录通过率。因此任何改造都无法判断是变好还是变坏，只能凭感觉继续加 prompt。

## What Changes

按「服务端供给事实、执行动作、守住不可逆；其余归模型」重划边界，分 6 批独立可验收：

- **B0 基线**：清理死代码（`Guardrails` 全类 + `AiActService` 21 个无调用点方法）；跑 `release-smoke` / `daily-use` / `day-flow`，把通过率落进 `ai-eval/runs/` 作为门禁基线。
- **B1 结构化回执**：`appendToolMessage` 的中文软否决改为带错误码的回执（`PLACE_UNGROUNDED` / `QTY_UNGROUNDED` / `REF_UNKNOWN` / `REF_AMBIGUOUS` 等），模型按码修正而不是猜中文。
- **B2 参数来源申报（provenance）**：写调用带 `_src`，服务端只做**确定性**来源核验（`user` 比原文、`probe` 比行字段、`inference` 必须指向已存在的 ref、`habit` 比槽位）。`PlaceGrounding` / `WriteGrounding` 从「否决」降级为「审计」，不再用字面匹配判语义。
- **B3 引用生命周期**：`itemId` 升为一等入参（服务端校验「属本家 + 命中本次查到的集合」）；短号降为可选别名，并在 tool result 中重发，不再依赖模型跨轮记忆。
- **B4 行动权**：解除「本轮问过话 → 所有写一律扣住」；仅 `confirm=true` 与不可逆定位（删/合并的 `ref`）保留闸门。
- **B5 客户端诚实性**：点确认不再伪造 user 发言；`confirm` / `done` 分支不再丢弃 `lead`。

**保持不变的红线**：删除/合并必须点一次确认；禁止 NL 关键词路由；单一写入口（`item`/`space`/`tag`）；`turnId` 幂等。

## Capabilities

### New Capabilities

- `ai-tool-grounding`：写调用参数来源申报、确定性来源核验、结构化错误回执。
- `ai-decision-eval`：决策权回归题库与门禁（基线记录、每批通过线、防改题作弊）。

### Modified Capabilities

- `ai-assistant-act`：短号/`itemId` 引用、行动权边界、确认回合契约。
- `ai-agent-runtime`：Grounding 由否决转审计、prompt 只装领域知识、死代码清理。
- `ai-capability-registry`：`itemId` 入参、错误码目录、seed 版本升级。
- `ai-assistant-surface`：确认卡不伪造用户发言、保留模型正文。

## Impact

- **Java**：`PlaceGrounding`、`WriteGrounding`、`ActToolLoop`、`ActRefs`、`ActPrompt`、`AiActService`（含删死代码）、`CapabilityCatalog`、`ToolSchemas`、`DomainTools`、能力 seed。
- **小程序**：`packageAiAssist/assist/index.js`（`onConfirmRemove`、`applyResult` 的 confirm/done 分支）。
- **数据**：无 schema 变更；`_src` 只存在于请求/回执，不落库。
- **评测**：`ai-eval/bank/` 新增三类回归题（推断落点、同名确认、多轮短号），`ai-eval/runs/` 新增基线记录。
- **文档**：`docs/plans/2026-10-24-ai-decision-authority/README.md` 为实施向导；302 条盘点表为事实来源。
- **不影响**：登录/家庭/邀请码、物资字段与容量档、过期订阅、活动日志格式、页面直达。
