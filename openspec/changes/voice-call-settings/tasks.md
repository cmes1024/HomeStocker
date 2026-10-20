## 1. 数据与配置服务

- [x] 1.1 迁移 `V7__family_voice_settings.sql`：建表、外键 `ON DELETE CASCADE` / `ON DELETE SET NULL`、`IF NOT EXISTS` 写法与既有迁移一致
- [x] 1.2 `voice/app/VoiceModels`：可流式模型白名单、默认模型、名称展示、合法判定；每个型号注释验证日期与现象
- [x] 1.3 `voice/app/VoiceSettingsService`：按家庭读取、upsert 保存、解析出「生效模型 + 生效密钥 + 生效音色」，逐项回退
- [x] 1.4 解析失败面：无配置行、模型不在白名单、`key_id` 指向已删密钥、该家无 MiMo 密钥，分别给出确定行为

## 2. 通话链路接入

- [x] 2.1 `VoiceCallController` 去掉 `key.model()` 依赖，改由 `VoiceSettingsService` 提供模型与密钥
- [x] 2.2 保持库存快照、分句阈值、TTS 请求与帧格式完全不变
- [x] 2.3 无配置时与变更前逐字节等价（同模型、同音色、同请求体）

## 3. 设置接口

- [x] 3.1 `POST /api/voice/call/getSettings`：已保存值、生效值、可选模型、可选密钥
- [x] 3.2 `POST /api/voice/call/saveSettings`：upsert；模型白名单校验；`keyId` 归属与 provider 校验
- [x] 3.3 错误提示可读，不透出上游英文原文

## 4. 小程序

- [x] 4.1 通话页加设置入口，不遮挡现有通话操作
- [x] 4.2 设置页：模型单选、音色、密钥选择（默认自动），保存与回显
- [x] 4.3 保存失败有明确提示；未改动时不产生配置行

## 5. 测试与回归

- [x] 5.1 场景用例：管家换模型不影响通话、拒绝故障型号、密钥被删后回退、未配置按默认
- [ ] 5.2 回归：管家对话与写库、库存快照内容、TTS 音频可播、分句与打断
- [ ] 5.3 端到端：真机通话一次，字幕与声音同步
