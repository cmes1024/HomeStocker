## Why

家庭物资的主路径是增删改查，但一条条手填进账不现实，商品也缺少封面图。需要一条不影响现有清单/编辑的 AI 录入支路：拍照分行、逐行语音、核对后再走现有 `item` / `space` 写接口。讨论与定稿见 `docs/plans/2026-09-16-package-ai-capture/`。

## What Changes

- 新增分包 `packageAi`：采集向导（图 + 每行语音转写）→ 一次抽取 → 卡片预览（可放弃）→ 确认后逐个入账
- 新增云函数 `ai`：家庭 DeepSeek 密钥（掩码列表、默认一把失败再换）、提示词入库、代发模型、物资旁路挂图
- 新集合 `familyAiKeys`、`aiPrompts`、`itemMedia`；客户端写 deny
- 首页仅加浮窗进入分包；家庭页可选「AI 额度」入口；解散家庭时清密钥与旁路图
- 入账只调用现有 `item.create`（`source: 'agent'`）与必要时的 `space.createLocation`；**不改** `item` 云函数字段与清单展示
- **不做（本 change）**：视觉识别、对话查询/流式/LangGraph、清单出图、自动建空间或标签、自定义 baseUrl / 第二模型预设、复活 `pages/chat`

## Capabilities

### New Capabilities

- `ai-item-capture`: 分包向导、按行语音、合并抽取、预览放弃、经现有写接口入账
- `family-ai-keys`: 家庭级 DeepSeek 预设密钥、全员共用、掩码、默认与 failover
- `item-sidecar-media`: 入账成功后把封面图挂到旁路集合，清单本版不展示

### Modified Capabilities

- （无。活动消息仍由现有 `item.create` 旁路产生，不改 `item-activity-log` / `family-message-feed` 的需求文本。）

## Impact

- 小程序：`app.json` 分包；`pages/items/index` 浮窗；可选 `pages/family/index` 一行；全部新 UI 在 `packageAi/`
- 云函数：新建 `ai`（axios 出网，超时 60s）；`family` 解散路径增加清理 `familyAiKeys` / `itemMedia`
- 文档库：三集合 + 安全规则 + 索引；`collections.md` 回写
- 微信：同声传译插件（或官方等价 STT）；云函数出网
- 外部：DeepSeek `deepseek-chat`，额度来自家庭配置的 key
- 文档：`docs/plans/2026-09-16-package-ai-capture/` 为讨论与方案源；本 change 为实施规格
- Agent 预留：写库仍只走 `item` / `space`；本版不上 `chatProxy` / LangGraph
