## Why

V3 已定主路径（history + 查库、无会话袋），但召回仍粗（probe/search 同源弱过滤、易 listAll）、history 截断可能丢掉数量回执、prompt 偏肥挤占上下文。需要在不引入 Jev/lastOps/NL 路由的前提下提升稳健性。

## What Changes

- **查库召回：** 共享关键词检索；带 name 的 probe 优先按名；收紧回执恢复 probe；`item.search` 与 probe 同源。
- **History 保回执：** 20 轮窗口内优先保留含数量回执（`已改`+`→`）的助手轮；客户端与服务端截断对齐；稳定回执文案。
- **Prompt 瘦身：** 压缩重复与示例；能力 hint 去重；bump assist prompt version。
- **不做：** Jev、lastOps/aiSessions/recent 袋、ES、MCP 知识平台、用户话术正则→calls。

## Capabilities

### New Capabilities

- （无。）

### Modified Capabilities

- `ai-agent-runtime`: 命名探查与检索同源；回执恢复 probe 收紧；history 截断保回执轮。
- `ai-assistant-act`: act 上下文连续不因盲砍丢失刚改数量事实。
- `ai-assistant-surface`: 客户端 transcript 截断与云函数对齐保回执。
- `ai-capability-registry`: search hint 与共享检索行为一致（可发现、不漂移）。

## Impact

- 云函数 `ai`（`itemsQuery` / `receipts` / `model` / `promptAssist` / tools / capabilities）
- 分包 `packageAiAssist`（`transcript.js`）
- 小程序与云函数 `ai` 宜同发（history 截断规则两端一致）
