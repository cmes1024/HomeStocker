## Why

家庭管家（`packageAiAssist` + `ai.act`）控制面已收口（history + 查库、无会话袋、禁 NL 路由），但「场景会不会办、产品知不知道、自己是谁、手里有什么牌」散落在常驻 prompt 里，知识库只有容量一篇，能力 hint 像 API 文档，验收只覆盖加量/撤销/歧义。现在要练的是产品素养，不是训模型；再不分层，下次改 prompt 会重新喂胖，且无法判断该补知识、改 hint 还是动骨架。

## What Changes

- **阶段 1 场景课表：** 维护一份带层归属的场景目录（查 / 记 / 改 / 撤 / 歧义 / 合并 / 直达 / 知识 / 边界等）。每条标明考的是 prompt、知识库、能力 hint 还是代码闸门。核心轨扩入手工验收。不新开评测框架、不微调模型。
- **阶段 2 产品/职能知识：** 在现有渐进知识包上补齐产品概念、管家职能与台账规矩（空间/位置/标签/临期等）。常驻 prompt 只留人格、通道与硬软分界；问到再 `knowledge.get`。不把全文打进 system prompt，不上 RAG。
- **阶段 3 能力说明书：** 现有启用接口的 hint 补「何时用 / 何时绝不该用」（如勿用 create 加量）。本阶段不新开放写接口（`space.update` / `tag.update` 仍关；家庭/密钥仍硬 deny）。
- **架构：** 不改 V3 主路径；不加会话操作袋；不加话术→接口正则。
- **不做：** 微调 / 自训模型、ES、MCP 知识平台、`aiKnowledge` 集合迁库、用户自定义「教管家」偏好、新领域写模型。

## Capabilities

### New Capabilities

- `ai-assist-knowledge`: 渐进产品知识（目录常驻、正文按需 `knowledge.get`）。在已有 `capacity` 之外，提供产品概念、管家职能、台账规矩等 topic；问产品/职能/限额时取阅，禁止臆造目录外口径。

### Modified Capabilities

- `ai-agent-runtime`: 明确素养分层：常驻 prompt 只承担人格与通道软规范；产品/职能教科书不得整篇内联；场景口诀不得变成话术→工具表。
- `ai-assistant-act`: 产品/职能/容量类问题走知识取阅再答；场景课表核心轨作为 act 可验收合同（手工，不引入自动评测进程）。
- `ai-capability-registry`: 启用写/查接口的模型可见 hint 必须带岗位边界（何时用、何时禁用），与执行器同一份目录。

## Impact

- 云函数 `ai`：`knowledge/*`、`promptAssist.js`（version bump）、`capabilities.js`（hint + version bump）、`agent/context` 仅消费既有占位符
- 文档：`docs/plans/2026-09-23-ai-assist-curriculum/`（课表 + 阶段预期 + 验收）
- 小程序 `packageAiAssist`：无协议变更则不必同发；仅当 prompt/能力表 version 覆盖需要时与云函数 `ai` 同发
- 既有写路径 `item` / `space` / `tag` 不另套逻辑
