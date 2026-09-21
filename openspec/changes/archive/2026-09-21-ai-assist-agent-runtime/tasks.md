## 1. Skeleton

- [x] 1.1 在 `cloudfunctions/ai/` 下建立 `agent/` 与 `tools/` 目录骨架（context / orchestrator / guardrails / registry），`act.js` 暂仍可调用旧逻辑
- [x] 1.2 定义统一 `ToolResult` 与 plan 调用形状，与现有 ask / confirm / done / lead+blocks 响应字段对齐

## 2. Tool handlers

- [x] 2.1 从 `executeCalls` 抽出 `item.search` / `listExpiring` / `create` / `update` / `remove` / `merge`（若种子仍启用）/ `space.createLocation` 为独立 handler，底层仍用 `itemService` / `locationWrite`
- [x] 2.2 实现 `tools/registry.js`：enabled ∩ 硬底线过滤、按 `use` 调度、顺序执行与失败保留已成功
- [x] 2.3 新增 expire-subscribe 面板 tool（种子 + handler），返回现有面板所需数据/标志；从 `act` 入口删除预模型短路
- [x] 2.4 能力表与 prompt 渲染改为只读 registry/同一份 enabled 列表；需要时 bump `aiCapabilities` 与 `assist-act-v2` version

## 3. Orchestrator

- [x] 3.1 实现 context builder：鉴权后的家庭树、能力、focus/history/recent、prompt 填充（从 `act.js` 迁出）
- [x] 3.2 实现 orchestrator：模型计划 → ask 早退 → 至多一次 probe 再问模型 → registry 执行 → 代码汇报
- [x] 3.3 实现 guardrails：confirm 重放跳过模型、硬 deny、无 tool/probe/focus/recent 依据则不把模型 reply 当库存权威
- [x] 3.4 删除结构-only / 盘点强制 probe / 相关意图正则；补强 `assist-act-v2` 中结构问答与何时 probe 的说明
- [x] 3.5 将 `act.js` 收薄为导出入口，接线新 orchestrator；去掉对旧 `executeCalls` 意图旁路的依赖

## 4. Client and docs

- [x] 4.1 如 subscribe 响应字段有变，适配 `packageAiAssist`；其余协议保持兼容
- [x] 4.2 更新验收清单：模型先答结构、盘点走 probe/tool、订阅经模型+tool、删除确认、无密钥、硬底线
- [x] 4.3 回写 `docs/plans/2026-09-17-ai-assistant-v2/` 控制流说明，指向本 change；注明不再使用意图预路由
