## 1. 禁旁路与去会话袋

- [x] 1.1 扫并删除 `ai` / `packageAiAssist` 中 NL 话术→calls/改 plan 的旁路；保留短号解析、白名单、确认闸门、空计划兜底、执行回执
- [x] 1.2 删除客户端 `recentItems`/`recentItemIds` 状态与回传；服务端忽略其作为真相源
- [x] 1.3 **不实现** lastOps / `aiSessions` 会话操作账本；从方案与代码路径中排除
- [x] 1.4 grep 验收：无关键词路由、无跨轮操作内存依赖

## 2. 上下文 + 查库主路径（无会话内存）

- [x] 2.1 定稿主路径：问题不清 → ask；数据不清 → 查库；对话已表明「各加 1」→ 撤销即各减 1；**无**跨轮操作内存
- [x] 2.2 重写 prompt：业务知识/规范、操作边界、场景描述、tool 能力说明；**非**硬约束表、**非**放任空壳、**非**话术→接口对照
- [x] 2.3 **上下文连续：** 统一客户端与服务端 history 轮数/单轮长度上限；截断保留最近完整往来；避免 system 挤爆导致 history 实质为空；验收「加完再撤销」语义不断
- [x] 2.4 短号仅本轮 F*/P*；bump assist prompt version 并覆盖旧 `aiPrompts`

## 3. 编排模块整理

- [x] 3.1 理清 context / model / plan / tools / guardrails / presentation；orchestrator 只做循环
- [x] 3.2 能力表 id 与 tool handler 一一对应

## 4. 客户端

- [x] 4.1 芯片仅澄清文本进 act；确认卡只重放服务端 `pendingCalls`
- [x] 4.2 去掉 SHORT_AFFIRM 等会改写意图的正则侧路（若仍存在）

## 5. 文档与验收

- [x] 5.1 更新 `AGENTS.md` / 计划指针：主路径 = history + 查库；废弃 recent/lastOps 思路
- [x] 5.2 手工：各加 1 → 撤销 → 数量回滚；删指定数量 → 不足则说明；同名歧义会 ask/probe
- [x] 5.3 小程序与云函数 `ai` 同发说明
