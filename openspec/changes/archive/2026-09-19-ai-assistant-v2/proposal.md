## Why

AI V1 只覆盖拍照抽取向导，查/改/删仍靠手填；09-07 半屏 LangGraph 对话也不适合当下一刀。需要一条自然语言助手：看见家庭结构与系统能力边界后由模型出计划，执行器走现有写接口，且不改动手填表和 V1 采集。讨论与定稿见 `docs/plans/2026-09-17-ai-assistant-v2/`。

## What Changes

- 新集合 `familyTrees`：只存空间 → 位置、标签骨架；结构写成功后同步，缺失则重绘；物资变更不改树
- 新集合 `aiCapabilities`：系统级能力表（version 覆盖）；渲染进模型与执行器白名单读同一份
- `aiPrompts` 新增 `assist-act-v2`，与 `item-extract-v1` 并列；云函数新 action `ai.act`（文本 → 计划 → 白名单执行 → 代码汇报）
- 新分包 `packageAiAssist`：自然语言输入、追问槽位、操作汇报；**不做语音**
- 助手页本地最多保留 **20** 条文字气泡（按家庭隔离）；`ai.act` history 同样封顶 **20**，与界面窗口对齐；冷启动不恢复确认卡 / pending 写调用 / 芯片 / 物资结果卡
- 家庭页增加文字助手入口；清单 **V1 拍照浮窗行为不变**；详情可带当前物资作为 focus
- 复用 `familyAiKeys`；入账/改/删仍只调现有 `item` / `space.createLocation`，`source: agent`
- **不做（本 change）**：语音、视觉、流式、LangGraph / `pages/chat`、自动合并、助手内建房间或改标签、切家庭、把 V1 采集改成 V2、云端会话存档

## Capabilities

### New Capabilities

- `family-structure-tree`: 家庭结构树的存储、结构写入后更新、stale 重绘、解散清理；树不含物资
- `ai-capability-registry`: 系统能力表的版本种子、enabled 过滤、硬底线、与 prompt/执行器同源
- `ai-assistant-act`: `ai.act` 计划循环（树 + 能力 + 可选探查）、确认闸、经现有 action 执行、代码汇报
- `ai-assistant-surface`: 新分包文本 UI、与 V1 采集并存的入口、无密钥引导、追问与汇报

### Modified Capabilities

- `family-home-surface`: 家庭页增加打开文字助手的入口；不替换 AI 额度行或清单拍照浮窗
- `family-ai-keys`: 家庭密钥同时服务 V2 `ai.act`（无密钥则不调模型）；failover 与掩码规则不变
- `item-detail`: 详情可打开文字助手并带上当前物资作为 focus；编辑/删除主路径不变

## Impact

- 小程序：`app.json` 注册 `packageAiAssist`；`pages/family/index` 工具入口；`packageBrowse` 详情加入口；**不改** `packageAi` 采集逻辑与清单 FAB
- 云函数：`ai` 增加 act / 树与能力 ensure；`space` / `tag` 写成功旁路更新树；`family` 建家种子树、解散删树
- 文档库：`familyTrees`、`aiCapabilities`；`aiPrompts.assist-act-v2`；客户端写 deny；`collections.md` 回写
- 外部：DeepSeek 仍由家庭 key、云函数代发；超时与 V1 extract 同级
- 文档：方案源 `docs/plans/2026-09-17-ai-assistant-v2/`；本 change 为实施规格
- Agent 预留：写库仍只走 `item` / `space` / `tag`；不上 `chatProxy` / 仓库 `agent/`
