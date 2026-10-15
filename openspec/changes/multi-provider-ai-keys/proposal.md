## Why

管家把家庭密钥固定成 DeepSeek。DeepSeek 返回 503 或正文中断时，没有另一家可换，对话只能失败。密钥表里已经有平台、地址和模型字段，缺的是可选预设和按平台填写的地址。

## What Changes

- 密钥页改为选择预设平台后粘贴 API key。该平台的默认模型已选好，地址由服务端目录写入，用户不能自填地址。
- 目录首批包含 DeepSeek、Kimi、智谱、通义千问、阶跃星辰、MiniMax。每家至少一个对话模型。
- 调用使用库存的完整接口前缀，不再无条件补 `/v1`。已保存的 `https://api.deepseek.com` 仍补上 `/v1`。
- 默认密钥失败时仍最多再试一把，下一把可以是另一家平台。
- 两把都失败、密钥无效、额度用尽的提示保持可理解，不展示上游英文原文。

## Capabilities

### New Capabilities

### Modified Capabilities

- `family-ai-keys`: 添加密钥从「只写 DeepSeek」改为「只接受预设平台和模型」；助手调用跟随该预设的地址与 JSON 格式。

## Impact

- `packageAi/keys`、`utils/copy.js`
- `AiKeyService`、模型目录、`DeepSeekClient`、`ActPrompt`
- 已有密钥行不迁移；旧客户端只传 key 时仍按 DeepSeek 默认模型保存
