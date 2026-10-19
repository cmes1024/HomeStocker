## Context

`family_ai_keys` 已保存 `provider`、`base_url`、`model`、`api_key`。`addKey` 在缺省时写成 DeepSeek 默认模型（当前为 `deepseek-flash`），并接受客户端传入的 `baseUrl`。`DeepSeekClient` 会给不以 `/v1` 结尾的地址再补一段 `/v1`。智谱的前缀是 `/api/paas/v4`，补 `/v1` 会指错。已入库的 DeepSeek 地址多半是 `https://api.deepseek.com`，没有版本段，仍依赖这次补全。

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
2. 默认模型（按厂商官方文档核对后的当前阵容；旧型号保留为「（旧版）」、不再默认——删除会让已存密钥在 `PlatformKeyService.listEnabledForCall` 解析时抛异常）：
   `deepseek-flash`、`kimi-k3`、`glm-5.3-flash`、`qwen3.7-plus`、`step-3.5-flash`、`MiniMax-M2`。
   - **DeepSeek**：官方模型表已无 `deepseek-chat`（保留为旧版）。在售为 `deepseek-flash`（V4.1-Flash-1017，Vision ✓）与 `deepseek-v4-pro`（V4-Pro，不支持视觉）。
   - **Kimi**：`kimi-k2` 已下线，已存的这把调用时改走 `kimi-k2.6`，并关闭思考。新增旗舰 `kimi-k3`。官方：K3 / K2.7 Code / K2.6 均支持文本、图片与视频输入。
   - **智谱**：不收录 `glm-5.3`，该模型思考与 `json_object` 冲突。默认 `glm-5.3-flash`（官方定价页：原生多模态，图片/视频/文件/文本）。`glm-4.5-flash`、`glm-4v-plus` 保留为旧版。
   - **通义**：`qwen-plus` / `qwen-turbo` / `qwen-vl-plus` 保留为旧版。默认 `qwen3.7-plus`，另有 `qwen3.8-max`（二者同属文本生成与图像理解）、`qwen3.8-flash`（文本生成）。
   - **阶跃** `step-3.5-flash`、**MiniMax** `MiniMax-M2`：未核对到官方最新阵容，维持原状。
   - 视觉能力（`vision`）标记用于编辑页「按图预填」（`ai.capture`），见 `openspec/changes/ai-photo-prefill/`。
3. 空的 `provider` 仍解析为 DeepSeek 默认模型，避免未更新的客户端无法添加。
4. 401 且没有下一把时，返回「密钥无效，请到 AI 配置页检查」。其他可重试失败仍是「助手暂时不可用，请稍后重试」。额度用尽保持原句。
5. 日志从 `deepseek ok/fail` 改为 `model ok/fail`，避免把其他平台记成 DeepSeek。

## Risks / Trade-offs

- 预设模型 id 会过期。过期后该平台调用失败，目录需要改一版。不在运行时向用户收集模型名。
- **新默认模型默认开启思考**：DeepSeek `deepseek-flash` 官方标注默认思考（effort high）；Kimi `kimi-k3` 的 `reasoning_effort` 默认 `max`。已在 `DeepSeekClient.writeLimits` 对 `deepseek-flash` / `deepseek-v4-*` / `kimi-k3` 发 `thinking: {type: disabled}`（K3 另压 `reasoning_effort: low`）。**更关键的是**：DeepSeek 官方要求带 `tools` 的思考请求必须回传 `reasoning_content`，否则 400——助手正是带 tools 调用，关掉思考同时避开了这个坑。旧的 `deepseek-chat` 不认识该参数，不带。
- MiniMax 的正文有时带思考标签，JSON 计划可能解析失败。失败走现有的计划修复，不因此换密钥。
- 旧客户端看不到平台选择，新保存的仍是 DeepSeek。要换平台必须用新密钥页。

## Migration Plan

不改已有行。部署 API 与小程序密钥页。回滚时旧客户端仍只传 key，服务端空平台继续落成 DeepSeek。

## Open Questions

1. `kimi-k3` 是否接受 `thinking: {type: "disabled"}`？官方只文档化了顶层 `reasoning_effort`（low/high/max，无 none）。若 K3 强制思考、且我们带 `tools` 调用不回传 `reasoning_content`，可能 400。需实测：若确为强制思考，则在 `ChatResult` 里带回 `reasoning_content` 并在后续轮次回传。
2. `glm-5.3-flash` 的准确 API model id 是 `glm-5.3-flash` 还是 `glm-5.3-flashx`（官方定价页列 GLM-5.3-Flash，z.ai 列 GLM-5.3-FlashX）？写错只影响该次调用（温和失败），需实测。
3. 阶跃（`step-3.5-flash`）与 MiniMax（`MiniMax-M2`，百炼列表已出现 `MiniMax-M3`）的官方最新阵容尚未核对，是否需要一并更新？
