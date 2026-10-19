## Why

家庭物资主路径是增删改查，一条条手填进账不现实。09-17 退役的 V1 拍照录入（`packageAi`）从未做过视觉识别；当前编辑页（`pages/items/edit`）只能给物资挂封面图，拍完照名称、数量、日期仍要手打一遍。

现成的设施已经比 V1 时代完整：密钥全套走服务端（BYOK 从不给客户端）、`ModelCatalog` 平台目录、`ActKeyResolver` + `PlatformKeyFailover` 的密钥池化与冷却、`storage/upload` 压缩上传、`ai.act` 的 JSON 抽取式模型调用范式（提示词 + 一次 repair）。缺的只是把「图」作为一种输入接进来。

本 change 只解决「拍完照不用重打名称」：**编辑页内一次视觉抽取，回填为可编辑表单值，人核对后照旧走 `item.create/update`**。一条物资多个保质期的 lot 模型不在本 change（见 Non-Goals）。

## What Changes

- `ModelCatalog` 新增**视觉模型预设与「可看图」标记**（首批通义 / 智谱各一个）；未知模型 id 仍然拒绝；`listKeys` 的预设附带该标记，密钥页展示徽标。
- 新增**一次性抽取端点 `POST /api/ai/capture`**：入参为压缩小图 + 可选提示，返回 `{ fields: { name?, quantity?, unit?, note?, productionDate?, expireDate? } }`。不写台账、不进 history、不产生活动消息。
- 密钥选择复用 `ActKeyResolver` + hosted 池，但**优先选可看图密钥**：家庭默认密钥是纯文本（如 DeepSeek）时回退 hosted 池的视觉模型；两者都没有则返回 `AI_NO_VISION_KEY`，客户端隐藏/置灰入口。
- `DeepSeekClient` 增加**多模态调用变体**（OpenAI 兼容 image_url parts；小程序传 base64 data URL，不依赖 MinIO 公网可达）。
- 编辑页图片槽位区新增「按图预填」按钮：调用 → loading → **只回填空字段**→ toast 提示补了几项；保存路径不变（`source: 'ui'`）。
- 抽取提示词要求输出固定 JSON schema；数量/日期服务端归一化与强校验，非法值**丢字段不丢整单**。

## Capabilities

### New Capabilities

- `ai-photo-capture`: 编辑页视觉预填——图进、结构化字段建议出、人核对后照旧落账；复用家庭 BYOK 与 hosted 池，不新增第二套模型通道。

### Modified Capabilities

- `family-ai-keys`: `listKeys` 附带「可用视觉能力」标志与逐模型可看图标记；`ai.capture` 与 `ai.act` 共用同一批密钥、同一套冷却与限流。
- `item-edit-form`: 图片槽位区新增按图预填入场；表单校验与保存契约不变。

## Impact

- 服务端：`ModelCatalog`、`infra/DeepSeekClient`（新方法，旧路径不动）、新 `AiCaptureService` / `AiController.capture`、`AiRateLimitService` 复用
- 小程序：`pages/items/edit`（按钮/回填/失败态）、`utils/cloud.js` action 白名单、`utils/copy.js` 文案、`packageAi/keys` 徽标
- 与进行中的 `multi-provider-ai-keys` 正交：视觉预设只是目录新增条目，不改既有平台/模型的调用方式
- 数据层无 schema 变更；`item` / `space` / `tag` 写路径、`activities`、`itemExpireSubs` 提醒链路均不碰
