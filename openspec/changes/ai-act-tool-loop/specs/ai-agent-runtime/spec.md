## REMOVED Requirements

### Requirement: Receipt recovery probe prefers names
**Reason**: 工具循环重写后，写结果以 executed / touched 行在同一轮内直接对模型可见，「从历史数量回执反查库存做回滚恢复」的路径（`Receipts.parseLatestQtyChangeReceipts` / `probeFromReceipts`）整体移除，`Receipts` 类已删除。历史里的数量回执文本仍按未改动的「History truncation prefers qty receipts」保留，仅用于历史截断优先，不再用于恢复探查。

#### Scenario: No receipt-based rollback recovery
- **WHEN** a prior turn changed quantities and a later turn writes again
- **THEN** the system does not rebuild inventory from receipt text for rollback; the current turn's tool results are the source of truth
