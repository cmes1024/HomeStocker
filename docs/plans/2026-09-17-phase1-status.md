# HomeStocker 第一阶段现状快照

> 日期：2026-09-17  
> 分支：`reDesign`（HEAD `c684d54`，2026-09-16）  
> 性质：**对照代码的现状**，用来接上近一周文档断代；不是新功能方案  
> 第一阶段收口目标（产品口头锁定）：**用户体系、搜索、AI（待完善）**

完整 PRD / 功能清单 / 旧技术架构仍是愿景，**不是**本阶段范围。

---

## 1. 一句话

家庭协同管物资已经能跑通：建家、加人、记账、空间位置、标签保质期、家庭消息、命名主题都在小程序里。近两日又叠了口袋页、清单改版、读缓存、AI 拍照录入。**文档已于 2026-09-17 对齐代码**（OpenSpec 归档 + 主规格 + as-built）。第一阶段还差三块：**人能互相认出来、清单能搜、AI（V1 录入验收 + V2 文字助手 change）。**

---

## 2. 已落地（以代码为准）

| 波次 / 提交窗口 | 能力 | 规格 |
|-----------------|------|------|
| 09-10 MVP | 创建/加入家庭、邀请码、全员同权、物资增删改查、多家庭切换 | 归档 `2026-09-17-mvp-cloudbase-family-ledger`；主规格 `family-membership` / `item-ledger` / `mvp-shell` |
| 09-10 空间 | 默认仓库、自建空间/位置、清单按空间筛、空间浏览 | 归档 `2026-09-17-family-spaces-locations`；主规格 `family-spaces` |
| 09-11 A | 点击进详情、详情内编辑删除、分包 `packageBrowse`、命名主题（氛围图已收敛） | 归档 `2026-09-17-item-detail-atmosphere-perf`；主题另见 `family-named-theme` |
| 09-11 B | 家庭标签、保质期、即将过期横幅、订阅消息 | 归档 `2026-09-11-item-tags-expiry-reminders` |
| 09-11 C | `activities`、家庭消息、详情最近操作 | 归档 `2026-09-11-family-activity-messages` |
| 09-13～15 | 家庭页钥匙卡与工具格；清单货架；空间口袋（**无入口**） | as-built `2026-09-17-as-built-surfaces.md`；主规格 `family-home-surface` / `item-list-browse` / `space-pockets` |
| 09-15 | 命名主题三色（当时 3 套） | `2026-09-15-family-theme-system.md`；主规格 `family-named-theme` |
| 09-17 | 主题目录扩至 17 套；氛围选择器一行最多 3 个、弹层可滚 | 同上；`THEME_PRESETS` 与 `family` 的 `THEME_IDS` 同步 |
| 09-16 | 过期订阅改为按人×物资，发出后删订阅 | 主规格 `expire-subscribe-reminders`（已含） |
| 09-16 | 云函数读缓存 + `activity.cursor` | `2026-09-16-cloud-call-cache/`；主规格 `cloud-read-cache` |
| 09-16 | AI 分包拍照/语音录入、家庭 DeepSeek 密钥、旁路封面 | 归档 `2026-09-17-package-ai-item-capture`；验收未勾 |
| 09-16 | 物资日志带地点与通顺句式 | 归档 `2026-09-17-activity-place-log-copy`；已进 `item-activity-log` / `family-message-feed` |

主包页面：`onboarding` / `items` / `items/edit` / `family` / `family/tags` / `family/messages`。  
分包 browse：空间列表/详情、物资详情、口袋。  
分包 ai：采集、密钥。  
`pages/chat` 与 `chatProxy` **不在产品路径**。

云函数：`family` `item` `space` `tag` `activity` `expireNotify` `ai`（另保留 `stt` / `chatProxy` 壳）。

数据集合以 `miniprogram/cloud/collections.md` 为准（含 `familyAiKeys` / `aiPrompts` / `itemMedia`）。

---

## 3. 文档怎么读（2026-09-17 已对齐）

入口：`docs/README.md`。现行合同在 `openspec/specs/`（21 个 capability）。进行中 change：`ai-assistant-v2`。

| 文档 | 现在的角色 |
|------|------------|
| `docs/README.md` + 本文件 | 第一阶段地图与缺口 |
| `AGENTS.md` | Agent 工作约定，指向本快照 |
| `next-abcd-roadmap.md` | A/B/C **已完成**的历史路线；D / 对话仍后置 |
| `mvp-cloudbase-redesign.md` | 基线决策；表里「体验上单家庭」是 MVP 当时的话，产品已改成多家庭 |
| `PRD-*`、功能清单、技术架构 | 愿景；文首已标明不要当实施范围 |
| `2026-09-07-ai-assistant-design.md` | 后置半屏对话（LangGraph）；**不是** V2 |
| `2026-09-17-ai-assistant-v2/` | **AI 助手 V2 方案**；change：`openspec/changes/ai-assistant-v2/` |
| `2026-09-16-package-ai-capture/` | **AI V1** 拍照录入；代码已合、验收未勾 |
| `2026-09-17-as-built-surfaces.md` | 钥匙卡 / 货架 / 口袋（口袋无入口） |
| `collections.md` | 集合/索引；背景已改为命名主题 |

相对最可信的技术事实源：**代码 + `collections.md` + `openspec/specs/` + 本快照。**

---

## 4. 第一阶段剩余三项（缺口，不是方案）

### 4.1 用户体系

- 身份只有云开发 `OPENID`。`users` 建档时 `nickname: ''`，没有授权头像、改名、成员列表。
- 家庭消息 / 详情最近操作读 `users.nickname`，空则显示「家人」。
- 家庭页能看到成员**人数**，看不到是谁。
- 旧 PRD 的角色权限（创建者/管理员/只读）**仍不在本阶段**。本项是「人能被认出来」，不是权限模型。

### 4.2 搜索

- 云函数 `item.search`：有 `keyword` 时拉最多 100 条再按名称包含过滤；空 keyword 走 `list`；可带 `spaceId` / `tagId`。
- 首页导航搜索栏只有占位文案，**没有点击、没有输入、没有结果页**。
- 清单可按空间筛；**按标签筛没有首页入口**（编辑打标已有）。
- 不做 Elasticsearch / RAG。对话查询若后接，仍应走结构化 `item.search`。

### 4.3 AI（待完善）

已合代码、**不能当成已验收**：

- `packageAi`：选图分行 → 每行语音/手改 → `ai.extract` → 预览确认 → `item.create`（`source: agent`）+ 可选 `space.createLocation` + `ai.attachMedia`。
- 家庭 BYOK：`familyAiKeys`，云函数代发 DeepSeek；客户端只见掩码。
- 图进 `itemMedia`，清单/详情本版不渲染。
- 语音：插件市场方案已失效，真机需 `ai.transcribe`（服务市场一句话识别）；失败可手打。
- `docs/plans/2026-09-16-package-ai-capture/验收.md` **全部未勾**。

明确还不是本支路的：

- 半屏对话、流式、LangGraph tool 循环（09-07；**不是** V2）。
- 仓库 `agent/` 仍接 `MockBackend`，未对真云函数。
- 视觉识别（图不送模型，只当封面）。

**AI 助手 V2**（自然语言 + 家庭树 + 能力表）方案见 [`2026-09-17-ai-assistant-v2/`](./2026-09-17-ai-assistant-v2/README.md)，实施规格 `openspec/changes/ai-assistant-v2/`，**尚未写代码**；与本小节 V1 拍照向导分开验收。

「待完善」建议拆开看：① V1 录入真机验收与语音稳定性；② 要不要清单出图；③ V2 助手按该目录方案另开 change（不再默认用 09-07 半屏对话当下一刀）。

---

## 5. 信息架构（代码）

```
引导（无家）
 └─ 全家清单（主路径；按空间筛；临期一条横幅；AI 浮窗）
      ├─ 新增/编辑物资
      ├─ 物资详情（分包）→ 编辑/删除
      ├─ 家庭
      │    ├─ 钥匙邀请码 / 主题 / 标签 / 消息 / AI 额度
      │    ├─ 逛空间 → 空间列表 → 空间详情
      │    ├─ （口袋页已注册，暂无入口）
      │    └─ 多家庭切换、再创建/加入、离开/解散
      └─ AI 采集（分包；非对话）
```

写路径原则未变：页面与未来 Agent **同一套** `item` / `family` / `space` / `tag` 云函数；`ai` 只做抽取/密钥/挂图/转写，不另造创建物资。

---

## 6. 文档权威顺序

1. **`docs/README.md` + 本文件** — 现在读哪、还差什么  
2. `openspec/specs/` — 行为合同  
3. `miniprogram/cloud/collections.md` — 集合、索引、换环境  
4. 各波次方案当历史决策，不再当「下一步待做」  
5. `AGENTS.md` — 给后续 Agent 的约定  
6. 旧 PRD / 功能清单 — 愿景备查  

进行中的 OpenSpec change：`openspec/changes/ai-assistant-v2/`。新能力用 `openspec new change`，不要手建目录。
