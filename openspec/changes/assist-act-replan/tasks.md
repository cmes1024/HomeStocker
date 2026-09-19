## 1. Runtime

- [x] 1.1 registry：失败快照 + pending + createClassFailed；不做降级决策
- [x] 1.2 orchestrator：EXEC 回灌 + 最多一轮 askModel 重编排 + 合并汇报
- [x] 1.3 prompt v25：`{{EXEC}}` + C2；model `renderExecReceipt`

## 2. Docs

- [x] 2.1 OpenSpec + 验收

### 验收

1. 储物柜 createLocation 失败 → 二次模型应能重出 item.createMany（改挂厨房等）；代码不自动改挂。
2. 重规划后再失败 → 不再第三次规划。
3. 成功路径无 EXEC 二次调用。
4. 部署 `ai` 后 prompt version ≥ 25。
