## 1. 分包与入口

- [ ] 1.1 `app.json` 注册 `packageAiAssist` 助手页；主包不恢复 `pages/chat`
- [ ] 1.2 家庭页增加文字助手入口，`navigateTo` 新分包；不替换 AI 额度行
- [ ] 1.3 物资详情增加助手入口，带当前 `itemId` 作为 focus；编辑/删除入口不变
- [ ] 1.4 清单 AI 浮窗仍进入 V1 采集；回归清单不改拉数与筛选
- [ ] 1.5 助手页用 AppShell / 当前主题；无家时 reLaunch onboarding

## 2. 集合与种子

- [ ] 2.1 控制台创建 `familyTrees`、`aiCapabilities`；安全规则客户端写 deny
- [ ] 2.2 回写 `collections.md` 与 `database-rules.json`
- [ ] 2.3 `ai` 增加 ensure：`aiCapabilities` 文档 `assist-act-v2`（enabled 列表与硬底线按 design）；`aiPrompts.assist-act-v2`（version 覆盖，不改 `item-extract-v1`）
- [ ] 2.4 提示词正文按接口分节，占位符 `TODAY` / `TREE` / `CAPABILITIES` / `FOCUS` / `PROBE`；落到 `docs/plans/2026-09-17-ai-assistant-v2/` 或云函数模块

## 3. 家庭树

- [ ] 3.1 实现树的读写与从 spaces/locations/tags 重绘；不含物资
- [ ] 3.2 `space` / `tag` 写成功后旁路更新树（失败不回滚正写）
- [ ] 3.3 建家在默认空间/标签就绪后写树；解散删除该家 `familyTrees`；leave 不删

## 4. `ai.act` 与执行器

- [ ] 4.1 `act` 鉴权同 item：OPENID → currentFamilyId → membership；空文本拒绝；忽略伪造 familyId
- [ ] 4.2 加载 enabled 能力表 + 树 + 可选 focus；无 key 返回明确错误不调模型
- [ ] 4.3 调 DeepSeek JSON 计划（复用 extract 的出网与 failover）；解析 `ask` / `probe` / `calls`
- [ ] 4.4 `ask` 非空则零写入；`probe` 最多一次物资查询后可再问模型一轮，忽略二次 probe
- [ ] 4.5 确认 `cloud.callFunction` 到 `item`/`space` 是否带上 OPENID；不行则抽共享写 helper，禁止第二套校验
- [ ] 4.6 执行器：`use` ∈ enabled ∩ 硬底线；名称对树；`createLocation` 后 `item` 写；`source: agent`；remove 无 `confirmed` 不执行
- [ ] 4.7 顺序执行，失败保留已成功；代码拼汇报（含同位置同名可能重复，不合并）

## 5. 助手页交互

- [ ] 5.1 文本提交、加载、展示 ask 芯片/确认删、回填后重跑 act；两轮仍缺槽则引导现有编辑页
- [ ] 5.2 展示汇报；无 key 引导现有 `packageAi/keys`
- [ ] 5.3 本版无语音、无选图送模型

## 6. 回归与文档

- [ ] 6.1 对照 V1 采集：浮窗、抽取、密钥页仍可用
- [ ] 6.2 更新 `acceptance-checklist.md`（助手入口、act、树、解散、与 V1 并存）
- [ ] 6.3 更新 `docs/plans/2026-09-17-ai-assistant-v2/` 状态为实施中；密钥不进 git
