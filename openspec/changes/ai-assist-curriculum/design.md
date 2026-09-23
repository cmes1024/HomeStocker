## Context

See `proposal.md` Why。现行运行时已具备四层槽位：常驻 `promptAssist.js`、渐进 `knowledge/*`（仅 `capacity`）、`capabilities.js` hint、`agent/orchestrator.js` 有限拍数。V3 主路径（history + 查库、无会话袋、禁 NL 路由）保持不动。知识包 schema 已对齐未来 `aiKnowledge` 集合，本变更仍用代码包。

## Goals / Non-Goals

**Goals:**

- 用一份带层归属的场景课表驱动后续改动，避免「感觉笨就改 prompt」。
- 把产品/职能/台账教科书迁到渐进知识；prompt 收回骨架。
- 能力 hint 成为岗位说明书（何时用 / 何时禁用），与执行器同一份目录。
- 分三阶段落地，每阶段有可验收预期；阶段之间可以停。

**Non-Goals:**

- 不改编排骨架、不加评测进程、不微调模型。
- 不新开放 `space.update` / `tag.update`，不放松 `family.*` / 密钥硬 deny。
- 不迁 `aiKnowledge` 集合，不上 RAG / ES。
- 不做用户侧「教管家」偏好。

## Decisions

### D1 一层课表，三阶段实施

课表（场景 × 层归属 × 期望）是唯一训练计划；实现按 1 课表 → 2 知识 → 3 hint 的顺序，后一阶段对照课表改，不回头扩骨架。

备选：三份独立 OpenSpec change。否决：同一所有权规则拆开会漂。一份 change、任务按阶段分组，阶段 1 完成后即可停。

### D2 事实只住一层

| 层 | 住什么 |
|----|--------|
| prompt | 人格、通道（ask/probe/calls/reply）、禁止空计划、短号本轮有效 |
| knowledge | 产品是什么、管家职能、空间/位置/标签/临期、容量口径 |
| capability hint | 该接口何时用、何时禁用（create≠加量，quantity 绝对值） |
| 代码 | 身份、白名单、确认、回执保活、跨家拒绝 |

冲突时以所属层为准，另一层删除重复句，不写第二套路由表。

备选：继续把场景口诀堆进 prompt。否决：与刚完成的瘦身相反，且无法按课表定位。

### D3 知识 topic 集合（阶段 2）

代码包，沿用现 schema（`topicId` / `version` / `summary` / `body` / `enabled`）：

| topicId | 内容 |
|---------|------|
| `capacity` | 已有：免费档 / 加强版 / 兑换；继续附 liveFacts |
| `product` | HomeStocker 是当前家庭共享台账；页面与管家同一写入口 |
| `role` | 管家 = 台账操作 + 产品导游；不能建家/密钥/代兑；能 `page.get` 时不说「还没学会」 |
| `ledger` | 空间 / 位置 / 物资 / 标签 / 临期订阅（按人×物资）；数量是绝对值 |

单轮仍硬顶 3 次 `knowledge.get`。目录只进 `{{KNOWLEDGE_INDEX}}`。

备选：一篇「百科」topic。否决：正文过长，违背渐进读取。

### D4 课表核心轨（阶段 1 写进文档，阶段 2/3 对照改）

核心轨必须能手测（期望见同目录验收，apply 时落盘）：

1. 厨房两件各加 1 → 撤销回原数量  
2. 减量超过库存 → 说明不够，不写负数  
3. 同名两处 → ask / probe，不默默改错条  
4. 「记一笔」已有同空间同名 → ask 合并或另开，不加量误用 create  
5. 已有行各加 N → probe 后 `item.update` 绝对值，不用 create/createMany  
6. 「打开标签管理 / 密钥」→ `page.get` open，不说还没学会  
7. 「你能干什么 / 空间和位置有什么区别 / 免费档多少件」→ `knowledge.get` 再答  
8. 「解散家庭 / 删密钥」→ 拒执行，走能力边界或硬 deny  

扩展轨（有则测、不挡阶段完成）：建空间再挂物资、合并两条、临期订阅面板、闲聊拐台账、跨家庭隔离。

### D5 不新开自动评测

阶段 1 产出 `docs/plans/2026-09-23-ai-assist-curriculum/`（课表 + 阶段预期 + 验收）。对账靠手工与云函数日志（是否出现 `knowledge.get` / `page.get`）。没有稳定 mock 模型前，不上 CI 黄金对话。

备选：录 request/response fixture 跑回归。可后置，不进本 change。

### D6 版本与发布

- 阶段 1：只文档，无需发版。  
- 阶段 2：知识包 + prompt version bump（收回内联教科书）。只发云函数 `ai` 即可；客户端协议不变。  
- 阶段 3：`CAPABILITY_VERSION` bump 覆盖 hint。只发云函数 `ai`。  
- 小程序与 `ai` 仅在截断规则或 UI 协议再变时同发；本 change 不预期。

## 阶段预期

| 阶段 | 做完时的样子 | 怎样算过 |
|------|--------------|----------|
| 1 课表 | 每条核心/扩展场景有层归属；验收清单覆盖核心轨 8 条 | 评审能指出「办砸了该改哪一层」；不改运行时代码 |
| 2 知识 | 目录可见 `product` / `role` / `ledger` / `capacity`；prompt 不再整篇内联这四类正文 | 问职能/概念/限额时日志有对应 `knowledge.get`；答法不与 topic 冲突；写库烟雾（各加 1 / 撤销）不回退 |
| 3 hint | 启用写/查/直达接口的 hint 含禁用句 | 「各加」不走 create；打开标签页走 `page.get`；能力表 version 已覆盖 |

整份 change 完成 = 三阶段都过。允许只合并阶段 1 文档后停。

## Risks / Trade-offs

- [模型不问知识库，仍靠记忆胡答] → Mitigation：prompt 留一句「产品/职能/限额须 knowledge.get，勿臆造」；验收第 7 条看日志。不因此加关键词强灌正文。  
- [prompt 收回教科书后短时变笨] → Mitigation：阶段 2 与验收同发；若写库核心轨回退，先把必要的一句通道规矩还回 prompt，不把全文贴回去。  
- [hint 变长挤占上下文] → Mitigation：每条 hint 两句为上限（何时用 + 何时禁用）；禁止把课表整表打进 catalog。  
- [课表变成话术路由] → Mitigation：课表是人看的考试，不进运行时；规格继续禁止 NL 关键词路由。

## Migration Plan

1. 先合阶段 1 文档（无运行时风险）。  
2. 阶段 2 部署云函数 `ai`；旧 `aiPrompts.assist-act-v3` 由更高 version 覆盖。回滚：把 prompt version 降回上一版种子（或控制台改回旧 `system`）并去掉新 topic 的 `enabled`。  
3. 阶段 3 部署能力表更高 version。回滚：降 `CAPABILITY_VERSION` 或控制台回旧 `apis[].hint`。  
4. 知识包与能力表均无客户端迁移。

## Open Questions

- 若阶段 2 手测发现模型经常漏 `knowledge.get`，是加一句 prompt 还是把 `product` 摘要再缩短——等验收数据再定，不改课表所有权。
