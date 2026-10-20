## ADDED Requirements

### Requirement: 通话配置独立于管家密钥

通话使用的对话模型 MUST 来自家庭通话配置，MUST NOT 读取 `family_ai_keys` 行上的 `model` 字段。管家侧修改密钥模型 MUST NOT 改变通话行为。

#### Scenario: 管家换模型不影响通话

- **WHEN** 家庭已保存通话配置，模型为 `A`
- **THEN** 成员随后在管家密钥页把同一把密钥的模型改成 `B`
- **AND** 通话仍使用 `A`

#### Scenario: 未配置时按默认工作

- **WHEN** 家庭从未保存过通话配置
- **THEN** 通话使用默认模型与第一把 MiMo 密钥，行为与上线前一致

### Requirement: 对话模型白名单

通话模型 MUST 限制在服务端白名单内。保存不在白名单的模型 MUST 被拒绝。已保存的模型若已不在白名单，通话 MUST 回退到默认模型并继续，MUST NOT 因此失败。

#### Scenario: 拒绝已知流式故障的型号

- **WHEN** 成员提交通话模型 `mimo-v2.6-pro`
- **THEN** 系统拒绝保存并提示该型号不可用于通话

#### Scenario: 存量配置失效时回退

- **WHEN** 已保存模型后来被移出白名单
- **THEN** 通话使用默认模型，不报错

### Requirement: 密钥以指针引用

通话配置 MUST 只保存 `key_id` 指针，MUST NOT 复制 `api_key` 或 `base_url`。`key_id` MUST 属于当前家庭且 `provider` 为 `mimo`。密钥被删除时配置 MUST 自动失效并回退到该家第一把 MiMo 密钥。

#### Scenario: 拒绝其他家庭的密钥

- **WHEN** 成员提交一个不属于本家庭或非 MiMo 的 `keyId`
- **THEN** 系统拒绝保存

#### Scenario: 密钥被删后仍能通话

- **WHEN** 配置指向的密钥被删除，且该家仍有其他 MiMo 密钥
- **THEN** 通话使用剩余的第一把密钥，不报错

### Requirement: 通话设置读写

系统 MUST 提供读取与保存通话设置的接口，保存为按家庭 upsert。读取响应 MUST 同时包含已保存值与实际生效值。保存 `voice` 为空 MUST 表示不覆盖客户端传入的音色。

#### Scenario: 保存后立即生效

- **WHEN** 成员保存模型 `X`
- **THEN** 下一次通话即使用 `X`，无需重启或重新登录

#### Scenario: 响应包含生效值

- **WHEN** 配置只保存了模型，未指定密钥
- **THEN** 响应中的生效密钥为该家第一把 MiMo 密钥

### Requirement: 不影响既有能力

本变更 MUST NOT 改变库存快照内容、分句与 TTS 行为、管家密钥选择、物资写路径与活动流。

#### Scenario: 快照与朗读保持

- **WHEN** 通话使用保存的模型
- **THEN** 库存快照内容与音频帧格式与变更前一致
