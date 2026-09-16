## 1. 分包入口

- [x] 1.1 `app.json` 增加 `packageAi` 分包并注册采集占位页；主包 pages 不恢复 `pages/chat`
- [x] 1.2 物资首页只加 AI 浮窗，`navigateTo` 进分包；不改拉数、筛选、空态主按钮
- [x] 1.3 占位页使用 AppShell / 当前家庭主题，无家时与其它页一样回到 onboarding

## 2. 集合与云函数骨架

- [x] 2.1 控制台创建 `familyAiKeys`、`aiPrompts`、`itemMedia`；安全规则客户端写 deny（读亦建议 deny）
- [x] 2.2 回写 `collections.md` 与 `database-rules.json`（字段、索引 `familyId` / `itemId`）
- [x] 2.3 新建 `cloudfunctions/ai`（`wx-server-sdk` + `axios`），按 action 路由；鉴权复制 item 同款 OPENID → currentFamilyId → membership，忽略客户端伪造的 familyId
- [x] 2.4 写入 `aiPrompts` 文档 `item-extract-v1`（正文以 `docs/plans/2026-09-16-package-ai-capture/提示词草稿.md` 为准）
- [x] 2.5 部署 `ai`：允许出网、超时 60 秒

## 3. 家庭 DeepSeek 密钥

- [x] 3.1 实现 `listKeys` / `addKey` / `removeKey` / `setDefaultKey`：预设 `deepseek` + 固定 baseUrl/model；上限 3；第一把默认；列表只回掩码
- [x] 3.2 分包密钥页：粘贴 key、可选名称、删、设默认；不得出现 baseUrl/模型输入
- [x] 3.3 无 key 时采集页引导去配置；家庭页可选加一行「AI 额度」入口

## 4. 抽取

- [x] 4.1 `extract`：入参 `rows[{index,text}]`；服务端拼提示词、今日上海日期、空间/位置/标签目录；一次调用 DeepSeek `deepseek-chat`，`json_object`，非流式
- [x] 4.2 将模型名称解析为 `spaceId` / `locationId` / `tagIds` / `willCreateLocation`；不对空间和标签自动建档
- [x] 4.3 默认 key 失败（401/402/429/5xx/超时）整包换下一把重试；无 key 明确错误；日志不打完整密钥

## 5. 采集与预览

- [x] 5.1 选图分行：缩略图、可编辑输入框、该行语音转文字（微信同声传译或当前官方 STT）；图不送模型
- [x] 5.2 开始识别：跳过空字行；全空拦截；成功后按 index 出卡片
- [x] 5.3 卡片「放弃录入」与底栏「确认录入 n 个物品」/「放弃本次录入」；名称为空或抽取 error 不可写入

## 6. 入账与旁路图

- [x] 6.1 未放弃项逐个：必要时 `callSpace('createLocation')` → `callItem('create', { source: 'agent', ... })`；失败停在当条并提示已成功件数
- [x] 6.2 全放弃：零 `item.create`、零上传
- [x] 6.3 `attachMedia`：校验 item 属本家后写 `itemMedia`；放弃行不上传；清单/详情本版不渲染该图
- [x] 6.4 保存成功返回首页，依赖现有写作废看到新物资与 agent 活动

## 7. 解散清理与回归

- [x] 7.1 `family` 解散路径删除该家 `familyAiKeys`、`itemMedia`，存储文件 best-effort 删除；普通 leave 不删家庭 key
- [x] 7.2 对照 `docs/plans/2026-09-16-package-ai-capture/验收.md`：密钥掩码、failover、两行绑定、手填物资回归

## 8. 文档

- [x] 8.1 更新 `miniprogram/cloud/acceptance-checklist.md`（AI 分包入口、密钥、抽取入账、解散清理）
- [x] 8.2 密钥与测试 key 不进 git；需要时点出控制台集合/超时/出网检查项
