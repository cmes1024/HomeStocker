# HomeStocker 文档地图

> 2026-09-17 起：先看本页，再决定翻哪份历史方案。  
> 代码对照：`reDesign` 分支。

## 现在以谁为准

| 你想知道 | 读这个 |
|----------|--------|
| 第一阶段做到哪、还差什么 | [`plans/2026-09-17-phase1-status.md`](./plans/2026-09-17-phase1-status.md) |
| 给 Agent 的工作约定 | [`../AGENTS.md`](../AGENTS.md) |
| 集合、索引、换环境、安全规则 | [`../miniprogram/cloud/collections.md`](../miniprogram/cloud/collections.md) |
| 可测试的行为合同 | [`../openspec/specs/`](../openspec/specs/) |
| 部署前勾选 | [`../miniprogram/cloud/acceptance-checklist.md`](../miniprogram/cloud/acceptance-checklist.md) |

`openspec/changes/` 下进行中：[`ai-assistant-v2`](../openspec/changes/ai-assistant-v2/)。已完成的在 `openspec/changes/archive/`。

## 正在设计 / 待实施

- [AI 助手 V2](./plans/2026-09-17-ai-assistant-v2/README.md) — 方案源；实施规格 [`openspec/changes/ai-assistant-v2/`](../openspec/changes/ai-assistant-v2/)

## 已落地方案（历史决策，不是待做清单）

按时间：

1. [MVP 云开发台账](./plans/2026-09-10-mvp-cloudbase-redesign.md) — 协同闭环基线；范围已被后续超过  
2. [空间与位置](./plans/2026-09-10-next-spaces-locations.md)  
3. [A→B→C 路线图](./plans/2026-09-10-next-abcd-roadmap.md) — **A/B/C 已做完**；D 与对话仍后置  
4. [A 波详情/性能](./plans/2026-09-10-next-a-item-detail-perf.md)  
5. [命名主题](./plans/2026-09-15-family-theme-system.md)  
6. [家庭页 / 货架清单 / 口袋 as-built](./plans/2026-09-17-as-built-surfaces.md)  
7. [云函数读缓存](./plans/2026-09-16-cloud-call-cache/方案.md)  
8. [AI 拍照录入](./plans/2026-09-16-package-ai-capture/README.md) — 代码已合，验收清单未勾  

## 愿景（不要当本阶段范围）

- [PRD](./PRD-家庭物资管理小程序.md) v1.2（角色权限、采购、OCR 等）  
- [功能清单](./家庭物资管理小程序-功能清单.md)  
- [技术架构](./技术架构-家庭物资管理小程序.md) v1.1（含 ES 搜索等未采用项）  
- [AI 对话助手（09-07）](./plans/2026-09-07-ai-assistant-design.md) — 半屏聊天 + LangGraph；**不是** V2。现行 V2 方案见上节  
- HTML 原型：仓库根目录 `family-supplies-prototype*`  

## 第一阶段还剩

用户体系、搜索 UI、AI V1 录入真机验收。助手 V2 见 [方案](./plans/2026-09-17-ai-assistant-v2/README.md) 与 [OpenSpec change](../openspec/changes/ai-assistant-v2/)。细节见现状快照。
