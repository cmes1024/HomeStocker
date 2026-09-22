## Why

管家能查改台账，但不知道产品页路径与入参，无法在适当时机给出「直达」跳转。把整份页面说明塞进 system prompt 又浪费 token、易过期。需要一条独立能力，让模型按需拉取页面目录与 query 约定，再由执行器校验后下发跳转按钮。

## What Changes

- 新增代码侧**产品页注册表**（path、必填/可选 query、一句话用途）；不含 demo 页。
- 能力目录新增 **`page.get`**：模型主动调用获取；默认不把全文页说明塞进每轮 prompt（最多在能力 hint 提示「直达前先 page.get」）。
- 同能力支持可选 **`open: true` + query**：白名单校验入参后返回 `ui: navLinks`，客户端渲染跳转按钮（类比 `expireSubscribePanel`）。
- **不**新增第二套写库；**不**用 NL 关键词猜测要跳哪一页；路径与 query 只认注册表。

## Capabilities

### New Capabilities
- `ai-page-registry`: 产品页注册表 + `page.get` 渐进拉取 + 校验后的直达按钮回执。

### Modified Capabilities
- `ai-capability-registry`: 启用 `page.get`，与 handler 同 id。
- `ai-assistant-act`: `page.get` 取回正文可注入本轮重编排（类 knowledge）；`open` 时旁路返回 navLinks。
- `ai-assistant-surface`: 渲染 `navLinks` 为可点跳转（白名单 URL，注意 query）。

## Impact

- 云函数 `ai`：`pages/` 注册表、`tools/pageGet.js`、`capabilities` seed 升版、编排注入、`presentation`/`registry` 回执字段
- 分包 `packageAiAssist`：气泡上的跳转按钮
- 与进行中的 `ai-assistant-v3` 正交：不碰 recent/lastOps；遵守「禁 NL 关键词路由」
