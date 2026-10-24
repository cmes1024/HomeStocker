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

**通过线**：`release-smoke` 100%；`daily-use` / `day-flow` ≥ 基线；回执 JSON 无中文指令句。

- [ ] 1.1 定义错误码常量（`PLACE_UNGROUNDED` / `QTY_UNGROUNDED` / `REF_UNKNOWN` / `REF_AMBIGUOUS` / `NAME_NOT_FOUND` / `INFERENCE_NO_BASIS` / `WRITE_HELD` / `ASK_REQUIRED`）
- [ ] 1.2 新增 `ToolFeedback`（或等价类）：`code` / `field` / `given` / `declared` / `candidates` / `quote` 的序列化，单条 ≤ 200 字符
- [ ] 1.3 `ActToolLoop.applyBatch` 的 `appendToolMessage` 改为写结构化回执（保留 `messages` 结构）
- [ ] 1.4 `PlaceGrounding` / `WriteGrounding` 的返回类型改为审计结论（`code` + 字段 + 候选），不再返回中文句子
- [ ] 1.5 `ActRefs.lookupRef` 在查不到时返回 `REF_UNKNOWN` 而非构造 stub
- [ ] 1.6 `ToolSchemas` 增补 `_src` 的 JSON Schema（`from` / `via` / `quote`），先只作用于 `spaceName` / `locationName` / `quantity`
- [ ] 1.7 注册到能力表 seed（版本 +1），`AiSeedService` 可升级
- [ ] 1.8 跑 `release-smoke` + `daily-use`，确认通过率不降

## 2. B2 provenance 核验（Grounding 转审计）

**通过线**：`release-smoke` 100%；「保鲜膜推断落点」回归题从 2 轮变 1 轮通过；`audit.inference` 占比有记录。

- [ ] 2.1 新增 `Provenance` 解析与核验：`user`（比 `groundText`）/ `probe`（比 ref 行字段）/ `inference`（只校验 `via` 存在）/ `habit`（比槽位）/ `default`
- [ ] 2.2 `PlaceGrounding.ungrounded` 改为只产出审计结论；`blocked` 语义删除
- [ ] 2.3 `WriteGrounding.blocked` 同上；删除「本句没提日期/标签」这类字面判断
- [ ] 2.4 `applyBatch`：`_src` 核验失败 → 结构化回执 + 不执行；核验通过 → 执行
- [ ] 2.5 兼容模式：无 `_src` 的写调用只记 `audit.noSource`，不拦截
- [ ] 2.6 `item.remove` / `removeMany` / `merge` 若 `from=inference`，确认卡文案追加「按推断选中，依据 P{n}」
- [ ] 2.7 日志增加 `[ai.act] audit` 行：`code` / `from` / `field`，便于统计占比
- [ ] 2.8 启用「保鲜膜推断落点」回归题，要求一轮内 `item.update` 成功
- [ ] 2.9 跑三份 plan，对比基线；`audit.inference` 占比写入批报

## 3. B3 引用生命周期

**通过线**：`day-flow` ≥ 基线；「多轮短号」回归题通过；无 `REF_UNKNOWN` 误报。

- [ ] 3.1 能力表 `item.remove` / `item.update` 的 `args` 增补 `itemId?`，seed 版本 +1
- [ ] 3.2 `ActRefs` 接受 `itemId`：校验「属本家 + 命中本次查到的集合」，否则 `REF_UNKNOWN`
- [ ] 3.3 `ingest` 取消「已见行跳过」，改为重发（带短号 + 名称 + 位置）
- [ ] 3.4 `knownRows` 与 `ingest` 去重逻辑合并，避免同轮重复
- [ ] 3.5 短号保持服务端签发；tool result 文案统一为 `P1 酱油 2瓶 厨房/橱柜`
- [ ] 3.6 启用「多轮短号引用」回归题（3 轮以上，跨轮引用同一行）
- [ ] 3.7 跑三份 plan，对比基线

## 4. B4 行动权

**通过线**：`release-smoke` 100%；`daily-use` ≥ 基线；「先问后写」场景一轮内完成。

- [ ] 4.1 `applyBatch` 扣住条件收窄为仅 `confirm=true`
- [ ] 4.2 允许同批 `ask` + write（删除「本轮改为提问，这项先不写入」分支）
- [ ] 4.3 `MAX_STEPS` 4 → 6，观察预算是否够用
- [ ] 4.4 保留 `WRITE_CLAIMS` 无回执检测（仍要防「假装已写入」）
- [ ] 4.5 跑三份 plan，对比基线；记录「多轮变一轮」的题数变化

## 5. B5 客户端诚实性

**通过线**：确认卡不受影响；确认后 history 中无伪造 user 消息；模型正文在 confirm/done 分支可见。

- [ ] 5.1 `onConfirmRemove` 不再 push user 气泡；`confirmed:true + planId` 表达确认
- [ ] 5.2 `applyResult` `confirm` 分支 `text = [data.lead, title]`
- [ ] 5.3 `applyResult` `done` 分支优先 `data.reply`
- [ ] 5.4 冷启动恢复时若存在失效确认，提示「上一张确认已失效」
- [ ] 5.5 真机验证：确认合并、取消、冷启动恢复三条路径

## 6. B6 收尾

**通过线**：prompt 版本下降 ≥ 20% 字数且三份 plan 不降；文档归档。

- [ ] 6.1 逐条清理 prompt 中的流程补丁（「不要自己挑」「先问放在哪」「不要在 ask 里预确认」）
- [ ] 6.2 保留领域知识（同名规则、记账口径、临期口径、闸门说明）
- [ ] 6.3 更新 `docs/plans/2026-10-24-ai-decision-authority-map.md` 的状态列
- [ ] 6.4 跑三份 plan 终验；`openspec archive ai-decision-authority`
