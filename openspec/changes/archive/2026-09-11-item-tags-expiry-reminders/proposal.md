## Why

A 波已补齐「先看再改」与性能底座，但物资仍缺分类标签与保质期语境，食品/药品易过期却无处看见、无法提醒。B 波按路线图交付标签、可选保质期、订阅消息与首页即将过期，把「管得住」延伸到「用得完」。

## What Changes

- 家庭级标签管理（药品、饮料、工具、衣物等可预设 + 自建）；物资录入/编辑/详情可多选打标；清单可按标签筛选（轻量）
- 物资可选保质期字段：`productionDate?`、`expireDate?`（非必填）；详情/清单展示临期与已过期状态
- 物资级过期提醒开关（默认关）+ 家庭提醒总开关（默认开）；开启后走微信订阅消息，提前 **3 天 / 1 天 / 当天** 提醒
- 全家清单页（主路径首页）顶部新增「即将过期」模块，聚合临期与已过期物资入口
- **不做（本 change）**：保质期日历、OCR/语音录入、软删除与操作历史（C 波消息流）、批量开关/批量改标、分类统计图表、对话 Agent UI、为新而新的交互实验（D）

## Capabilities

### New Capabilities

- `family-tags`: 家庭标签 CRUD、预设种子、物资多选打标与清单按标签筛选
- `item-expiry`: 可选生产/过期日期写入与展示；临期/过期状态计算
- `expire-subscribe-reminders`: 物资/家庭提醒开关、订阅授权、定时推送即将过期订阅消息
- `home-expiring`: 清单首页「即将过期」模块

### Modified Capabilities

- （无主库已归档 capability；行为以本 change delta 为准。实施时扩展现有 `item` / `family` 云函数与详情/编辑/清单页。）

## Impact

- 小程序：标签管理入口（家庭页或独立页）、编辑/详情打标与保质期字段、清单筛选与即将过期模块、订阅消息授权引导
- 云函数：扩展 `item`（tagIds / dates / reminder）；扩展 `family`（提醒总开关）；新建 `tag`（或并入合适域）；新建定时 `expireNotify`（或等价）发订阅消息
- 文档库：新集合 `tags`；`items` 增字段；`families` 增提醒总开关；索引 `familyId+expireDate`、`familyId+tagIds`（或等价）
- 微信侧：订阅消息模板申请与 `tmplIds` 配置；触发器日程
- 文档：回写 `collections.md`、`AGENTS.md` 下一版指针；范围源 `docs/plans/2026-09-10-next-abcd-roadmap.md`
- Agent 预留：标签与保质期写仍走云函数 action；`items.source` 不变；不另套改库
