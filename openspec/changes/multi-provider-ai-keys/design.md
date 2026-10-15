## Context

`family_ai_keys` 已保存 `provider`、`base_url`、`model`、`api_key`。`addKey` 在缺省时写成 DeepSeek，并接受客户端传入的 `baseUrl`。`DeepSeekClient` 会给不以 `/v1` 结尾的地址再补一段 `/v1`。智谱的前缀是 `/api/paas/v4`，补 `/v1` 会指错。已入库的 DeepSeek 地址多半是 `https://api.deepseek.com`，没有版本段，仍依赖这次补全。

## Goals / Non-Goals

**Goals:**

- 服务端目录是地址和模型 id 的唯一来源。保存时丢掉客户端地址。
- 选平台后默认模型已选中。名称可空，空则用平台名。
- 调用按库存前缀请求。旧的 DeepSeek 主机名仍补 `/v1`。
- `response_format: json_object` 只在该预设声明支持时附带。
- 换密钥规则保持：默认优先，最多再试一把。

**Non-Goals:**

- 用户自填地址或模型 id。
- 豆包。
- 推理模型，以及必须额外关闭思考才能返回 JSON 的模型。
- 同一次请求试完全部密钥。
- 成功时告诉用户换过平台。

## Decisions

1. 目录放在 `ModelCatalog`，不新增表字段。`listKeys` 附带不含地址的预设，供密钥页渲染。`json_object` 只留在服务端。
2. 首批默认模型：`deepseek-chat`、`kimi-k2.6`、`glm-4.7-flash`、`qwen-plus`、`step-3.5-flash`、`MiniMax-M2`。`kimi-k2` 已下线，已存的这把密钥调用时改走 `kimi-k2.6`，并关闭思考。智谱不用 `glm-5.3`，该模型思考与 `json_object` 冲突。通义另有 `qwen-turbo`，智谱另有 `glm-4.5-flash`，作为可选模型。
3. 空的 `provider` 仍解析为 DeepSeek 默认模型，避免未更新的客户端无法添加。
4. 401 且没有下一把时，返回「密钥无效，请到 AI 配置页检查」。其他可重试失败仍是「助手暂时不可用，请稍后重试」。额度用尽保持原句。
5. 日志从 `deepseek ok/fail` 改为 `model ok/fail`，避免把其他平台记成 DeepSeek。

## Risks / Trade-offs

- 预设模型 id 会过期。过期后该平台调用失败，目录需要改一版。不在运行时向用户收集模型名。
- MiniMax 的正文有时带思考标签，JSON 计划可能解析失败。失败走现有的计划修复，不因此换密钥。
- 旧客户端看不到平台选择，新保存的仍是 DeepSeek。要换平台必须用新密钥页。

## Migration Plan

不改已有行。部署 API 与小程序密钥页。回滚时旧客户端仍只传 key，服务端空平台继续落成 DeepSeek。

## Open Questions

无。
