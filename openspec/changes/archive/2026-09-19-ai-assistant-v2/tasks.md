## 1. 分包与入口

- [x] 1.1 `app.json` 注册 `packageAiAssist` 助手页；主包不恢复 `pages/chat`
- [x] 1.2 家庭页增加文字助手入口，`navigateTo` 新分包；不替换 AI 额度行
- [x] 1.3 物资详情增加助手入口，带当前 `itemId` 作为 focus；编辑/删除入口不变
- [x] 1.4 清单 AI 浮窗仍进入 V1 采集；回归清单不改拉数与筛选
- [x] 1.5 助手页用 AppShell / 当前主题；无家时 reLaunch onboarding

## 2. 集合与种子

- [x] 2.1 控制台创建 `familyTrees`、`aiCapabilities`；安全规则客户端写 deny
- [x] 2.2 回写 `collections.md` 与 `database-rules.json`
- [x] 2.3 `ai` 增加 ensure：`aiCapabilities` 文档 `assist-act-v2`（enabled 列表与硬底线按 design）；`aiPrompts.assist-act-v2`（version 覆盖，不改 `item-extract-v1`）
- [x] 2.4 提示词正文按接口分节，占位符 `TODAY` / `TREE` / `CAPABILITIES` / `FOCUS` / `PROBE`；落到 `docs/plans/2026-09-17-ai-assistant-v2/` 或云函数模块

## 3. 家庭树

- [x] 3.1 实现树的读写与从 spaces/locations/tags 重绘；不含物资
- [x] 3.2 `space` / `tag` 写成功后旁路更新树（失败不回滚正写）
- [x] 3.3 建家在默认空间/标签就绪后写树；解散删除该家 `familyTrees`；leave 不删

## 4. `ai.act` 与执行器

- [x] 4.1 `act` 鉴权同 item：OPENID → currentFamilyId → membership；空文本拒绝；忽略伪造 familyId
- [x] 4.2 加载 enabled 能力表 + 树 + 可选 focus；无 key 返回明确错误不调模型
- [x] 4.3 调 DeepSeek JSON 计划（复用 extract 的出网与 failover）；解析 `ask` / `probe` / `calls`
- [x] 4.4 `ask` 非空则零写入；`probe` 最多一次物资查询后可再问模型一轮，忽略二次 probe
- [x] 4.5 确认 `cloud.callFunction` 到 `item`/`space` 是否带上 OPENID；不行则抽共享写 helper，禁止第二套校验
- [x] 4.6 执行器：`use` ∈ enabled ∩ 硬底线；名称对树；`createLocation` 后 `item` 写；`source: agent`；remove 无 `confirmed` 不执行
- [x] 4.7 顺序执行，失败保留已成功；代码拼汇报（含同位置同名可能重复，不合并）

## 5. 助手页交互

- [x] 5.1 对话列表提交：发送后清空输入；加载、展示 ask 芯片/确认删；下一句带上下文重跑 act；两轮仍缺槽则引导现有编辑页
- [x] 5.2 展示汇报；无 key 引导现有 `packageAi/keys`
- [x] 5.3 本版无语音、无选图送模型
- [x] 5.4 `ai.act` 接受消毒后的 `history` 与 `recentItemIds`；写入 R 短号；不把数据库 id 交给模型

## 6. 回归与文档

- [x] 6.1 对照 V1 采集：浮窗、抽取、密钥页仍可用
- [x] 6.2 更新 `acceptance-checklist.md`（助手入口、act、树、解散、与 V1 并存）
- [x] 6.3 更新 `docs/plans/2026-09-17-ai-assistant-v2/` 状态为实施中；密钥不进 git

## 7. 本地对话窗口（20 / 20）

- [x] 7.1 助手页按 `familyId` 本地持久化最多 20 条文字气泡（`role`+`text`）；FIFO 丢最旧；切家庭不串聊
- [x] 7.2 冷启动只恢复文字气泡；不恢复 confirm / `pendingCalls` / 芯片 / `blocks` 结果卡
- [x] 7.3 客户端 `historyPayload` 与云端 `sanitizeHistory` 统一为最近 20 条（含 `ai-assist-agent-runtime` 中的同一上限）
- [x] 7.4 滑到最旧一条时展示「本地只保留这么多」类提示；验收清单补一条
