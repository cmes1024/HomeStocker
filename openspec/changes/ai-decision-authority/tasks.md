> 每批独立提交、独立验收、独立回滚。未拿到通过线数字前，不得进入下一批。

## 0. B0 基线（零行为改动）

**通过线**：编译 + 全量单测通过；`release-smoke` / `daily-use` / `day-flow` 三份 run 落盘并记录通过率。

- [x] 0.1 复核 `Guardrails` 全类无调用点（`grep -rn "Guardrails\." server/src`），确认后删除文件
- [x] 0.2 复核 `AiActService` 21 个无调用点方法（`isIdlePlan` … `pageFallbackText`）后逐个删除
- [x] 0.3 删除后全量编译 + `mvn -q test` 通过
- [x] 0.4 起容器（`docker compose up -d`），确认 `/api/health` 正常
- [x] 0.5 跑 `node ai-eval/runner.mjs --plan release-smoke --mode act`，结果落 `ai-eval/runs/<ts>-baseline/`
- [x] 0.6 跑 `daily-use` 与 `day-flow`，同样落盘
- [x] 0.7 在 `ai-eval/runs/<ts>-baseline/summary.md` 顶部写「基线：通过 x/y」，并提交
- [x] 0.8 新增 `ai-eval/bank/eng/` 三条回归题骨架（保鲜膜推断落点 / 同名确认 / 多轮短号），标 `pending` 待后续批次启用

**B0 结果（2026-10-24）：** `release-smoke 15/16` · `daily-use 32/35` · `day-flow 2/3`；见 `ai-eval/runs/20261024T110259Z-baseline/summary.md`

## 1. B1 结构化错误回执

**通过线**：`release-smoke` **不降**（原定 100%，2026-10-24 用户确认改为不降：基线掉题 `scene-want-coffee` 是模型不查库，非回执形态所致）；`daily-use` / `day-flow` ≥ 基线；回执 JSON 无中文指令句。

- [x] 1.1 定义错误码常量（`PLACE_UNGROUNDED` / `QTY_UNGROUNDED` / `REF_UNKNOWN` / `REF_AMBIGUOUS` / `NAME_NOT_FOUND` / `INFERENCE_NO_BASIS` / `WRITE_HELD` / `ASK_REQUIRED`）—— 另加过渡码 `FIELD_UNGROUNDED`（日期/标签字面判断，B2 删除该判断时一并退役）
- [x] 1.2 新增 `ToolFeedback`（或等价类）：`code` / `field` / `given` / `declared` / `candidates` / `quote` 的序列化，单条 ≤ 200 字符
- [x] 1.3 `ActToolLoop.applyBatch` 的 `appendToolMessage` 改为写结构化回执（保留 `messages` 结构）
- [x] 1.4 `PlaceGrounding` / `WriteGrounding` 的返回类型改为审计结论（`code` + 字段 + 候选），不再返回中文句子
- [x] 1.5 `ActRefs.lookupRef` 查不到不再构造 stub，返回 `null`（**偏差**：未在本批新增 `REF_UNKNOWN` 执行闸，引用生命周期归 B3，避免在 B3 之前新增闸门掉 day-flow 题）
- [x] 1.6 `ToolSchemas` 增补 `_src` 的 JSON Schema（`from` / `via` / `quote`），先只作用于 `spaceName` / `locationName` / `quantity`
- [x] 1.7 注册到能力表 seed（版本 +1），`AiSeedService` 可升级
- [x] 1.8 跑 `release-smoke` + `daily-use`，确认通过率不降

**B1 结果（2026-10-24）：** `release-smoke 15/16`（= 基线）· `daily-use 34/35`（基线 32/35）· `day-flow 2/3`（= 基线）；seed 46→47、prompt 69→70

## 2. B2 provenance 核验（Grounding 转审计）

**通过线**：`release-smoke` **不降**（同 B1，2026-10-24 确认）；「保鲜膜推断落点」回归题一轮内通过；`audit.inference` 占比有记录。

- [x] 2.1 新增 `Provenance` 解析与核验：`user`（比 `groundText`）/ `probe`（比 ref 行字段）/ `inference`（只校验 `via` 存在）/ `habit`（比槽位）/ `default`
- [x] 2.2 `PlaceGrounding.ungrounded` 改为只产出审计结论；`blocked` 语义删除（现为 `check`，只核对家庭结构里有没有该落点）
- [x] 2.3 `WriteGrounding.blocked` 同上；删除「本句没提日期/标签」这类字面判断（`check` 只留同名多条与整条删除数量对不上两条机器事实）
- [x] 2.4 `applyBatch`：`_src` 核验失败 → 结构化回执 + 不执行；核验通过 → 执行
- [x] 2.5 兼容模式：无 `_src` 的写调用只记 `audit.noSource`，不拦截
- [x] 2.6 `item.remove` / `removeMany` / `merge` 若 `from=inference`，确认卡文案追加「按推断选中，依据 P{n}」
- [x] 2.7 日志增加 `[ai.act] audit` 行：`code` / `from` / `field`，便于统计占比
- [x] 2.8 启用「保鲜膜推断落点」回归题，要求一轮内 `item.update` 成功（已加入 `release-smoke`，16 → 17 题）
- [x] 2.9 跑三份 plan，对比基线；`audit.inference` 占比写入批报

**B2 结果（2026-10-24）：** `release-smoke 16/17`（老 16 题仍 15，保鲜膜新题过）· `daily-use 34/35` · `day-flow 2/3`；prompt 70→71。
`audit.inference` 占比 **0/22**（本轮三份 plan 共 22 次申报写调用，全部 `from=user`），`refOnly` 5 次（按短号删/合，本批无 `_src` 字段可申报），`noSource` 0 次，核验驳回 2 次（`PLACE_UNGROUNDED` / `INFERENCE_NO_BASIS`）。
**偏差**：`_src` 核验字段按 D2 只覆盖 `spaceName` / `locationName` / `quantity`（另支持 `ref` 供确认卡用）；`B3` 前不新增引用闸门。

## 3. B3 引用生命周期

**通过线**：`day-flow` ≥ 基线；「多轮短号」回归题通过；无 `REF_UNKNOWN` 误报。

- [x] 3.1 能力表 `item.remove` / `item.update` 的 `args` 增补 `itemId?`，seed 版本 +1（47 → 48）
- [x] 3.2 `ActRefs` 接受 `itemId`：校验「属本家 + 命中本次查到的集合」，否则 `REF_UNKNOWN`（`ActToolLoop.refUnknown`，候选回落 `knownRefs`）
- [x] 3.3 `ingest` 取消「已见行跳过」，改为重发（带短号 + 名称 + 位置）
- [x] 3.4 `knownRows` 与 `ingest` 去重逻辑合并，避免同轮重复（`ingest` 直接复用已见行，`rows` 用 `containsRow` 去重）
- [x] 3.5 短号保持服务端签发；tool result 文案统一为 `P1 酱油 2瓶 厨房/橱柜`（**偏差**：沿用现有 `[P1] 酱油 1瓶 · 厨房/橱柜`，四要素齐备，未去方括号以免影响模型解析）
- [x] 3.6 启用「多轮短号引用」回归题（3 轮以上，跨轮引用同一行）—— 加入 `day-flow`（3 → 4 题）
- [x] 3.7 跑三份 plan，对比基线

**B3 结果（2026-10-24）：** `release-smoke 16/17` · `daily-use 34/35` · `day-flow 3/4`（老 3 题仍 2，多轮新题过）；`REF_UNKNOWN` 实测 0 次误报。

## 4. B4 行动权

**通过线**：`release-smoke` **不降**（同 B1/B2，2026-10-24 确认）；`daily-use` ≥ 基线；「先问后写」场景一轮内完成。

- [x] 4.1 `applyBatch` 扣住条件收窄为仅 `confirm=true`
- [x] 4.2 允许同批 `ask` + write（删除「本轮改为提问，这项先不写入」分支）
- [x] 4.3 `MAX_STEPS` 4 → 6，观察预算是否够用
- [x] 4.4 保留 `WRITE_CLAIMS` 无回执检测（仍要防「假装已写入」）
- [x] 4.5 跑三份 plan，对比基线；记录「多轮变一轮」的题数变化

**B4 结果（2026-10-24）：** `release-smoke 16/17` · `daily-use 34/35` · `day-flow 3/4`，与 B3 持平。
「多轮变一轮」：首轮即完成写入的题 **12/54 → 16/56**；三份 plan 总轮数 64 → 63。
**偏差**：同批同时出现 `ask` 与 `confirm` 时，确认卡优先（`Kind.CONFIRM`），问题句只进日志不放弃确认；此前是提问优先。

## 5. B5 客户端诚实性

**通过线**：确认卡不受影响；确认后 history 中无伪造 user 消息；模型正文在 confirm/done 分支可见。

- [x] 5.1 `onConfirmRemove` 不再 push user 气泡；`confirmed:true + planId` 表达确认（`skipUserBubble: true`）
- [x] 5.2 `applyResult` `confirm` 分支 `text = [data.lead, title]`（服务端 `buildConfirmPayload` 新增回传 `lead`）
- [x] 5.3 `applyResult` `done` 分支优先 `data.reply`
- [x] 5.4 冷启动恢复时若存在失效确认，提示「上一张确认已失效」（`hs_assist_confirm_pending_*` 标记 + `copy.assist.confirmExpired`）
- [ ] 5.5 真机验证：确认合并、取消、冷启动恢复三条路径 —— **未做**（无真机环境），仅 `node --check` 语法校验与代码走查

## 6. B6 收尾

**通过线**：prompt 版本下降 ≥ 20% 字数且三份 plan 不降；文档归档。

- [x] 6.1 逐条清理 prompt 中的流程补丁（「不要自己挑」「先问放在哪」「不要在 ask 里预确认」）
- [x] 6.2 保留领域知识（同名规则、记账口径、临期口径、闸门说明）
- [x] 6.3 更新 `docs/plans/2026-10-24-ai-decision-authority-map.md` 的状态列
- [x] 6.4 跑三份 plan 终验；`openspec archive ai-decision-authority`（**归档未执行**：整批改动尚未提交，归档会在提交前搬动本 change 目录；待提交后再跑）

**B6 结果（2026-10-24）：** prompt **3531 → 2821 字（-20.1%）**，版本 71 → 76；终验 `release-smoke 16/17` · `daily-use 34/35` · `day-flow 3/4`，与 B4 持平。
