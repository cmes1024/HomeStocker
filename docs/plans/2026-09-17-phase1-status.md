# HomeStocker 第一阶段现状快照

> 日期：2026-09-21（相对 09-17 快照：AI V1 拍照录入已退役；助手 V2 已落地）  
> 分支：`reDesign`  
> 性质：**对照代码的现状**，用来接上近一周文档断代；不是新功能方案  
> 第一阶段收口目标（产品口头锁定）：**用户体系、搜索**（AI 助手已落地）

完整 PRD / 功能清单 / 旧技术架构仍是愿景，**不是**本阶段范围。

---

## 1. 一句话

家庭协同管物资已经能跑通：建家、加人、记账、空间位置、标签保质期、家庭消息、命名主题、读缓存、家庭管家（AI 助手 V2）都在小程序里。旧拍照录入 V1 已退役。第一阶段还差两块：**人能互相认出来、清单能搜。**

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
| 09-16 | 家庭 DeepSeek 密钥（BYOK）；旧拍照录入 V1 **已退役** | 历史归档 `2026-09-17-package-ai-item-capture` |
| 09-16 | 物资日志带地点与通顺句式 | 归档 `2026-09-17-activity-place-log-copy`；已进 `item-activity-log` / `family-message-feed` |
| 09-19～21 | AI 助手 V2：`packageAiAssist` + `ai.act`（家庭树 + 能力表 + 白名单 tool） | 归档 `2026-09-19-ai-assistant-v2` 等；方案 `2026-09-17-ai-assistant-v2/` |

主包页面：`onboarding` / `items` / `items/edit` / `family` / `family/tags` / `family/messages`。  
分包 browse：空间列表/详情、物资详情、口袋。  
分包 `packageAi`：仅密钥页。  
分包 `packageAiAssist`：家庭管家。  
`pages/chat` 与 `chatProxy` **不在产品路径**。

云函数：`family` `item` `space` `tag` `activity` `expireNotify` `ai`（另保留 `stt` / `chatProxy` 壳）。

数据集合以 `miniprogram/cloud/collections.md` 为准（含 `familyAiKeys` / `aiPrompts` / `familyTrees` / `aiCapabilities`）。

---

## 3. 文档怎么读

入口：`docs/README.md`。现行合同在 `openspec/specs/`。

| 文档 | 现在的角色 |
|------|------------|
| `docs/README.md` + 本文件 | 第一阶段地图与缺口 |
| `AGENTS.md` | Agent 工作约定，指向本快照 |
| `next-abcd-roadmap.md` | A/B/C **已完成**的历史路线；D / 对话仍后置 |
| `mvp-cloudbase-redesign.md` | 基线决策；表里「体验上单家庭」是 MVP 当时的话，产品已改成多家庭 |
| `PRD-*`、功能清单、技术架构 | 愿景；文首已标明不要当实施范围 |
| `2026-09-07-ai-assistant-design.md` | 后置半屏对话（LangGraph）；**不是** V2 |
| `2026-09-17-ai-assistant-v2/` | **AI 助手 V2 方案**（已实施） |
| `2026-09-16-package-ai-capture/` | **已退役** AI V1 拍照录入（历史；见 archive） |
| `2026-09-17-as-built-surfaces.md` | 钥匙卡 / 货架 / 口袋（口袋无入口） |
| `collections.md` | 集合/索引；背景已改为命名主题 |

相对最可信的技术事实源：**代码 + `collections.md` + `openspec/specs/` + 本快照。**

---

## 4. 第一阶段剩余两项（缺口，不是方案）

### 4.1 用户体系

- 身份仍是云开发 `OPENID`。`users` 有 `nickname` / `avatarUrl`（云存储 fileID）；云函数 `family.updateProfile` / `listMembers`。
- 家庭页「家里的人」展示成员；半屏用 `chooseAvatar` + `input type="nickname"` 编辑资料。
- 家庭消息 / 详情最近操作 join 昵称与头像，空昵称仍显示「家人」。
- 旧 PRD 的角色权限（创建者/管理员/只读）**仍不在本阶段**。本项是「人能被认出来」，不是权限模型。

### 4.2 搜索

- 云函数 `item.search`：有 `keyword` 时拉最多 100 条再按名称包含过滤；空 keyword 走 `list`；可带 `spaceId` / `tagId`。
- 首页导航搜索栏只有占位文案，**没有点击、没有输入、没有结果页**。
- 清单可按空间筛；**按标签筛没有首页入口**（编辑打标已有）。
- 不做 Elasticsearch / RAG。对话查询若后接，仍应走结构化 `item.search`。

### 4.3 AI（已落地；V1 已退役）

**现行路径：**

- `packageAiAssist`：自然语言 → `ai.act` → 家庭树 + 能力表 → 白名单 tool → 现有 `item`/`space`/`tag`（`source: agent`）。
- 家庭 BYOK：`familyAiKeys`，云函数代发 DeepSeek；客户端只见掩码；密钥 UI 在 `packageAi/keys`。
- 清单顶栏 / 物资详情可进管家；无密钥引导密钥页。

**已退役（勿再验收或接线）：**

- 旧 `packageAi` 拍照分行 / `ai.extract` / `ai.transcribe` / `ai.attachMedia` / `itemMedia`。
- 历史方案见 `docs/plans/2026-09-16-package-ai-capture/` 与归档 `2026-09-17-package-ai-item-capture`。

仍后置、不是本支路：

- 半屏对话、流式、LangGraph tool 循环（09-07）。
- 仓库根 `agent/` 仍接 `MockBackend`，未对真云函数。

---

## 5. 信息架构（代码）

```
引导（无家）
 └─ 全家清单（主路径；按空间筛；临期一条横幅；顶栏进管家）
      ├─ 新增/编辑物资
      ├─ 物资详情（分包）→ 编辑/删除；可 focus 进管家
      ├─ 家庭
      │    ├─ 钥匙邀请码 / 主题 / 标签 / 消息 / AI 密钥
      │    ├─ 逛空间 → 空间列表 → 空间详情
      │    ├─ （口袋页已注册，暂无入口）
      │    └─ 多家庭切换、再创建/加入、离开/解散
      └─ 家庭管家（packageAiAssist；非半屏对话）
```

写路径原则未变：页面与 AI 助手 **同一套** `item` / `family` / `space` / `tag` 云函数；`ai` 只做密钥与 `act`，不另造创建物资。

---

## 6. 文档权威顺序

1. **`docs/README.md` + 本文件** — 现在读哪、还差什么  
2. `openspec/specs/` — 行为合同  
3. `miniprogram/cloud/collections.md` — 集合、索引、换环境  
4. 各波次方案当历史决策，不再当「下一步待做」  
5. `AGENTS.md` — 给后续 Agent 的约定  
6. 旧 PRD / 功能清单 — 愿景备查  

新能力用 `openspec new change`，不要手建目录。
