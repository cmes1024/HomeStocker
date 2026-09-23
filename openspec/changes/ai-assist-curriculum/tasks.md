## 1. 阶段 1 — 场景课表（只文档）

- [x] 1.1 新增 `docs/plans/2026-09-23-ai-assist-curriculum/README.md`：三阶段、层归属、阶段预期、链到本 change
- [x] 1.2 写 `课表.md`：核心轨 8 条 + 扩展轨；每条含层归属（prompt / knowledge / hint / 代码）与期望
- [x] 1.3 写 `验收.md`：核心轨手测步骤（含 knowledge.get / page.get 日志核对）；扩展轨可选
- [x] 1.4 在 V3 README 与 `docs/README.md`（或现状快照）加指针

## 2. 阶段 2 — 产品/职能知识 + prompt 骨架

- [x] 2.1 新增知识包 `product`（HomeStocker 是什么、同一写入口）
- [x] 2.2 新增知识包 `role`（职能、不能做的家事、能 page.get 不说还没学会）
- [x] 2.3 新增知识包 `ledger`（空间/位置/物资/标签/临期按人×物资、数量绝对值）
- [x] 2.4 在 `knowledge/index.js` 注册；`capacity` 保持 liveFacts
- [x] 2.5 收回 `promptAssist.js` 内联教科书，只留人格/通道/「问产品须 knowledge.get」；bump prompt version
- [x] 2.6 `knowledge.get` hint 列出可取 topicId（product / role / ledger / capacity）
- [x] 2.7 手测：职能/概念/限额会 `knowledge.get`；各加 1 → 撤销不回退

## 3. 阶段 3 — 能力岗位说明书

- [x] 3.1 为所有启用接口补「何时用 / 何时禁用」hint（create≠加量，update 绝对值，*Many 优先，page.get 不编 path）；bump `CAPABILITY_VERSION`
- [x] 3.2 删除 prompt 里与 hint 重复的接口说明书（冲突以 hint 为准）
- [x] 3.3 手测：各加走 update 不走 create；「打开标签管理」走 `page.get` open

## 4. 收口

- [x] 4.1 `openspec validate --change ai-assist-curriculum` 通过
- [ ] 4.2 按 `验收.md` 勾核心轨；需要时部署云函数 `ai`
