## Why

助手已能 NL 管台账，但叠了关键词旁路和「刚操作」会话袋（recentItems / 拟议 lastOps），偏离干净 Agent：家人说了什么、助手做了什么已在对话上下文里；缺库存事实应查库。V3 全栈重塑控制面——**严禁**「用户说了 xxx → 代码执行 xxx」，也**不另建跨轮操作内存**。

## What Changes

- **砍掉 NL 关键词意图路由（硬禁落地）：** 芯片/短确认不得用正则旁路拼 `calls`；只把原文或澄清句交给 `ai.act`。
- **BREAKING — 废除客户端 `recentItems` / `recentItemIds` 回传袋：** 不作为找「刚加的」或定数量的真相源。
- **不做服务端 lastOps / 会话操作账本：** 不确定的问题 → `ask` 用户；不确定的数据 → 查库（probe/search）；「各加 1 → 完成 → 撤销 = 各减 1」靠对话上下文理解。不另建跨轮内存。
- **短号仅本轮：** F* = 详情关注；P* = 本轮探查/查询结果。禁止靠跨轮「刚操作短号袋」绑撤销。
- **Prompt 定位（软规范，非硬约束、非放任）：** 承载业务知识/规范、操作边界、场景描述、tool 能力说明等，引导模型怎么做人；**硬约束**留在代码（白名单、确认闸门、身份、禁关键词旁路）。禁止把 prompt 写成话术对照表，也禁止去掉规范任模型乱来。
- **上下文连续：在设定的最大 history 窗口内保证语义不断。** 截断须保留最近完整往来（优先整轮 user/assistant，勿把「加了什么 / 做了什么」裁到无法承接撤销）；单轮文本上限与客户端 transcript 对齐，避免服务端二次砍短导致语义断裂；system/tool 占位不得挤占到 history 实质为空。
- **编排与模块整理：** 拆清 context / model / tools / presentation / guardrails；prompt 与能力表一致、可维护。
- **客户端瘦身：** 只维护 transcript、确认闸门 UI、传 history + focus；无 recent/lastOps 态。
- **不改：** 单一写入口、BYOK、确认闸门；不做半屏 LangGraph。

## Capabilities

### New Capabilities
- （无。不新增会话操作账本能力。）

### Modified Capabilities
- `ai-agent-runtime`: 模型唯一意图路由；上下文 + 查库；禁止话术旁路与跨轮操作内存当意图基础设施。
- `ai-assistant-act`: 去掉 recent 袋；follow-up 靠 history + 本轮 probe/focus；撤销/改量由模型从对话与查库结果编排。
- `ai-assistant-surface`: 芯片只交文本；不维护 recent 袋。
- `ai-capability-registry`: catalog 与 tool 一一对应、可发现。

## Impact

- 云函数 `ai`、分包 `packageAiAssist`、相关 OpenSpec / `AGENTS.md`
- **BREAKING：** 停用 recentItems 协议字段作真相源；小程序与云函数同发
- 不新增 `aiSessions` 一类会话集合（非本变更范围）
