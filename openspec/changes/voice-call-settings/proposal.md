## Why

通话取哪个对话模型，取决于家庭管家那把 MiMo 密钥上存的 `model` 字段。管家侧换模型会顺带把通话打坏：`mimo-v2.6-pro` / `mimo-v2.6-flash` 的流式接口只发 `: PROCESSING` 心跳、不发 `data:` 帧，通话会静默等到超时，客户端只看到「等待回复超时」，看不出根因。两条链路共用一个字段，出问题时也无法分别调整。

通话与管家的请求形态本来就不同：管家要 JSON 计划与工具调用，通话要低延迟纯文本流。模型选择理应各自独立。

## What Changes

- 新增 `family_voice_settings`：按家庭保存通话专用配置——对话模型、默认音色、指向哪一把 MiMo 密钥。
- 通话解析配置的顺序改为「家庭配置 → 默认值（该家第一把 MiMo 密钥 + 默认模型 + 默认音色）」，**不再读密钥行上的 `model`**。
- 对话模型走白名单：只允许实测能流式出字的型号。已知流式故障的型号不可保存。
- 新增通话设置的读写接口；小程序通话页加入口。
- 设置里只存密钥指针（`key_id`），不复制 `api_key` 明文；密钥仍由 `family_ai_keys` 单点管理。

## Capabilities

### New Capabilities

- `voice-call`: 语音通话的对话模型、音色与密钥来源独立配置，与家庭管家解耦。

### Modified Capabilities

## Impact

- 迁移 `V7__family_voice_settings.sql`
- `server/.../modules/voice/app`：新增配置服务与模型白名单
- `server/.../modules/voice/api`：新增设置接口；`VoiceCallController` 改为按配置取模型
- `miniprogram/packageVoiceCall`：通话页设置入口与设置页
- 不影响：家庭管家的密钥选择、`item` / `space` / `tag` 写路径、活动流、库存快照内容
- 已有家庭无配置行时按默认值工作，不需要数据迁移
