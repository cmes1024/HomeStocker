## 1. Wave 1 — 查库召回

- [x] 1.1 在 `itemsQuery` 实现共享关键词检索（提高候选拉取、过滤后 cap）；`runProbe` 带 name 时走该路径
- [x] 1.2 `item.search` tool 改用同一检索实现
- [x] 1.3 收紧 `probeFromReceipts`：优先按名+空间，避免无谓 listAll
- [x] 1.4 Prompt 软句（知名物资 probe 带 name）+ bump `assist-act-v3` version；同步 `item.search` capability hint
- [x] 1.5 烟雾清单：V3 A～C + 同名歧义 + 多件按名命中（见 `docs/plans/2026-09-22-ai-assist-context-retrieval/验收.md`；发版后手工勾）

## 2. Wave 2 — History 保回执

- [x] 2.1 服务端 `sanitizeHistory`：20 轮内优先保留含 `已改`+`→` 的助手轮
- [x] 2.2 客户端 `transcript` 截断与服务端对齐
- [x] 2.3 核对 presentation/回执文案仍可被 `parseQtyChangeReceiptsFromText` 解析（`item.update` summary 格式注释锁定）

## 3. Wave 3 — Prompt 瘦身

- [x] 3.1 压缩 `promptAssist.js` 重复句与示例（留代表形）并 bump version → 11
- [x] 3.2 能力表 hint 与 prompt 去重（search/update hint 收短；version 21）

## 4. 文档与收口

- [x] 4.1 新增 `docs/plans/2026-09-22-ai-assist-context-retrieval/` 指针；V3 README 链到后续优化
- [x] 4.2 `openspec validate`；主 specs 已同步；archive
