# 家庭管家内部架构与流程

> 依据代码实绘，不是设计稿。对照分支 `feature/ai-decision-authority`（含 2026-10-25 工作区未提交改动）。
> 代码若有变化，以「代码索引」里的文件为准，本文末尾标注了容易漂移的参数。

## 1. 分层架构

```mermaid
flowchart TB
  subgraph Client["① 端 · 小程序 packageAiAssist"]
    A["聊天页 assist/index.js<br/>POST /api/ai/act"]
    R["渲染 lead / blocks / present / confirm / ask"]
  end

  subgraph Entry["② 接入 · AiActService"]
    B["AuthFilter → openid<br/>X-HS-Token"]
    C["限流 checkAct<br/>Redis 计数"]
    D{"confirmed + calls ?"}
    E["ActPendingPlan<br/>Redis hs:ai:plan:* · 30min"]
  end

  subgraph Ctx["③ 上下文 · ActContextBuilder"]
    F["today / weekday / family / memberCount"]
    G["tree（空间·位置·标签名）"]
    H["history（含时间间隔标记）"]
    I["focus（详情页物资）/ recall（本句召回）"]
    J["snapshot（开场台账）/ probe / exec"]
    K["habits（家庭偏好槽）/ knowledge（知识包）"]
    L["capability（能力表 31 条 + hint + confirm）"]
  end

  subgraph Loop["④ 模型循环 · ActToolLoop（≤6 步 / 45s）"]
    M["ActPrompt 调模型<br/>家庭 BYOK≤2 + 托管池故障转移"]
    N{"有 tool_calls ?"}
    O["闸门：白名单 → _src → 短号 → 落点 → 数量/同名 → confirm"]
    P["DomainTools 执行"]
    Q["结果回灌（rows / probe / exec / 工具回执）"]
  end

  subgraph Out["⑤ 组装 · AiActService"]
    S["DONE"]
    T["ASK 澄清芯片"]
    U["CONFIRM 确认卡<br/>calls=待确认 · executed=已执行"]
    V["SUBSCRIBE 订阅面板"]
    W["ReplyTableGuard 裁正文手写表"]
    X["PresentResolver + Presentation"]
    Y["unbackedWriteClaim / degrade 兜底"]
  end

  subgraph Data["数据"]
    Z1[("PostgreSQL<br/>items / spaces / tags / activities<br/>familyAiKeys / aiCapabilities")]
    Z2[("Redis<br/>session / 限流 / pending plan")]
    Z3[("MinIO<br/>物资图片")]
  end

  A --> B --> C --> D
  D -->|是| E --> P
  D -->|否| F
  F --> G --> H --> I --> J --> K --> L --> M
  M --> N
  N -->|有| O --> P --> Q --> M
  N -->|无| S
  O -->|"held（删除 / 合并）"| U
  S --> W --> X --> Y --> R
  U --> R
  T --> R
  V --> R
  P --> Z1
  P --> Z3
  E --> Z2
  C --> Z2
  R --> A
```

## 2. 一次请求的状态机

```mermaid
stateDiagram-v2
  [*] --> Loop
  Loop --> Loop: 工具调用 → 校验 → 执行 → 回灌
  Loop --> Done: 模型不再调工具，正文可用
  Loop --> Ask: 缺对象 / 数量 / 落点
  Loop --> Confirm: 命中 confirm 能力（删除 / 合并）
  Loop --> Subscribe: 需要订阅面板
  Loop --> Degrade: 空转 / 超预算
  Confirm --> Executing: 客户端 confirmed + calls(+planId)
  Executing --> Done
  Done --> [*]
  Ask --> [*]
  Degrade --> [*]
```

## 3. 两条典型链路

### 3.1 「厨房有什么」— 查 + 画表

```mermaid
sequenceDiagram
  participant 端
  participant API as AiActService
  participant 模型 as ActPrompt
  participant 工具 as DomainTools
  participant 库 as PostgreSQL

  端->>API: text="厨房有什么"
  API->>API: 上下文（tree / recall / snapshot / 能力表）
  API->>模型: system prompt + history + 用户话
  模型-->>API: item.search{spaceName=厨房}
  API->>API: 闸门（白名单；读工具无需 _src）
  API->>工具: search
  工具->>库: select items
  库-->>工具: 7 行
  API->>模型: 回灌 7 行（P1..P7 短号）
  模型-->>API: present{table, 名称/数量/位置/过期/说明}
  API->>API: PresentResolver（过期列 → 快过期 2 天）
  API-->>端: lead 一句 + present 表格
```

### 3.2 「先把苹果改成3，再把电脑删掉」— 一段执行 + 一段确认

```mermaid
sequenceDiagram
  participant 端
  participant API as AiActService
  participant 模型 as ActPrompt
  participant 工具 as DomainTools
  participant Redis

  端->>API: text="先把苹果改成3，再把电脑删掉"
  API->>模型: 上下文 + 本句召回（苹果 P1 / 电脑 P2）
  模型-->>API: item.update{ref=P1, quantity=3} + item.remove{ref=P2}
  API->>API: update 过闸 → 执行
  API->>工具: update 苹果 2→3
  API->>API: remove 命中 confirm → held
  API-->>端: status=confirm<br/>calls=[remove 电脑]<br/>executed=[已改苹果 2→3]
  API->>Redis: 存 pending plan（30min）
  端->>API: confirmed=true + calls + planId
  API->>Redis: 校验 calls 与凭据一致
  API->>工具: remove 电脑
  API-->>端: status=done + executed=[已删掉电脑]
```

## 4. 五道闸门（顺序即代码顺序）

| # | 闸门 | 拦什么 | 失败回执 |
|---|---|---|---|
| 1 | 能力表白名单 | 未启用的工具 | 模型看不到该工具 |
| 2 | `Provenance`（`_src` 申报） | 落点/数量来源不可核：`user` 的 `quote` 必须出现在原话；`probe`/`inference` 必须带有效短号；`habit` 必须匹配习惯槽 | `PLACE_UNGROUNDED` / `QTY_UNGROUNDED` / `INFERENCE_NO_BASIS` / `REF_UNKNOWN` |
| 3 | `refUnknown` | F*/P* 短号本轮失效 | `REF_UNKNOWN` |
| 4 | `PlaceGrounding` | 落点不在家庭空间/位置树里 | `PLACE_UNGROUNDED` |
| 5 | `WriteGrounding` | 同名多条没指明；整条删除与库存数量对不上（数量按被删对象所在分句归属） | `REF_AMBIGUOUS` / `QTY_UNGROUNDED` |
| 6 | 能力表 `confirm` | 删除 / 合并 / 空间删除等 9 个写操作 | `WRITE_HELD` → 确认卡 |
| 7 | 执行 | 写库 + 旁路写 `activities`（`source=agent`） | 工具错误进 `report.failed` |

闸门不判断模型推理对不对，只核对机器事实（原话是否出现、短号是否存在、落点是否在树里、值与库存是否一致）。意图、改哪条、加还是减，全部由模型决定。

## 5. 关键参数

| 项 | 值 | 位置 |
|---|---|---|
| 工具步数上限 | 6（HEAD 是 4，工作区改动为 6） | `ToolSchemas.MAX_STEPS` |
| 单次 act 总预算 | 45 秒；单次调用上限 12 秒；剩余 < 1.5 秒不再开新轮 | `ActBudget` |
| 能力表 | 31 条，9 条需确认（`item.remove*`、`space.remove*`、`tag.remove*`、`item.merge`） | `capability-seed-v48.json` |
| 确认凭据 | Redis `hs:ai:plan:*`，30 分钟 | `ActPendingPlan` |
| 限流 | 30 次/分钟（容器环境变量 `AI_ACT_RATE_PER_MINUTE`） | `AiRateLimitService` |
| 模型钥匙 | 家庭 BYOK 最多试 2 把 + 平台托管池故障转移 | `ActPrompt` |

## 6. 代码索引

| 文件 | 职责 |
|---|---|
| `modules/ai/app/AiActService.java` | 入口、限流、confirm 重放、payload 组装（done/ask/confirm/subscribe） |
| `modules/ai/agent/ActContextBuilder.java` | 上下文：tree / history / focus / recall / snapshot / probe / exec / habits / knowledge / catalog |
| `modules/ai/agent/ActPrompt.java` | 模型 HTTP、钥匙池与故障转移、预算、prompt 渲染 |
| `modules/ai/agent/ActToolLoop.java` | 工具循环、五道闸门、短号、present 处理、预算/空转兜底 |
| `modules/ai/agent/Provenance.java` | `_src` 申报核验（user/probe/inference/habit） |
| `modules/ai/agent/PlaceGrounding.java` | 落点是否在家庭结构里 |
| `modules/ai/agent/WriteGrounding.java` | 同名多条、删除数量与库存核对 |
| `modules/ai/agent/ActRefs.java`、`ItemsProbe.java` | 短号签发、名称召回、按 id 装行 |
| `modules/ai/tools/DomainTools.java` | 工具执行 → 各 service |
| `modules/ai/agent/Presentation.java`、`PresentResolver.java`、`HabitReply.java` | 展示（blocks / 表格 / 统计 / 习惯） |
| `modules/ai/agent/ReplyTableGuard.java` | 裁掉正文里手写的表格 |
| `modules/ai/app/ActPendingPlan.java` | 确认凭据（Redis） |
| `modules/ai/app/AssistPromptTexts.java`、`resources/ai/capability-seed-v48.json` | 提示词与能力表 |
| `miniprogram/packageAiAssist/assist/index.js` | 请求、确认回传、渲染 |

## 7. 容易误解的点

- 模型不是"直接改库"：所有写都必须以工具调用形式发出，过闸门后由 `DomainTools` 落到与页面同一套 service。
- 读也不等于随便说：`item.search` 回灌的行会带 P* 短号，后续写只能引用本轮短号，不能自己编 `itemId`。
- 确认卡不是"整批原子"：同批里不触发 confirm 的写（如 `item.update`）已经落库，确认卡只覆盖 `calls` 里待确认的那几条；`executed` 字段用于回执已发生的事。
- 页面、管家、未来对话共用同一写入口；活动日志由写路径旁路产生，不由模型写。
- 禁止用关键词把话术映射到接口：闸门只做事实核验，路由由模型依上下文决定。
