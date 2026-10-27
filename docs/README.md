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

`openspec/changes/` 下进行中的 change 以目录为准；已完成的在 `openspec/changes/archive/`。

## 正在设计 / 待实施

- **[Java 后端迁移（进行中）](./plans/2026-09-30-java-backend-migration/README.md)** — 小程序保留；全部云函数 → `server/`（Spring Boot + PG + Redis）；实施勾选见 [路线图](./plans/2026-09-30-java-backend-migration/05-migration-roadmap.md)
- **[AI 管家决策权改版（待动工）](./plans/2026-10-24-ai-decision-authority/README.md)** — OpenSpec `ai-decision-authority`；B0–B6 分批，先记基线再改行为
- [管家素养课表](./plans/2026-09-23-ai-assist-curriculum/README.md) — OpenSpec `ai-assist-curriculum`；出问题先读 [迭代指南](./plans/2026-09-23-ai-assist-curriculum/迭代指南.md)
- [受众与适配（思考记录，未锁定）](./plans/2026-09-23-audience-and-fit.md) — 专人 / 手记脑记 / 出库优先；不是方案，不改现行家庭范围
- [AI 管家决策权归属对照表](./plans/2026-10-24-ai-decision-authority-map.md) — 302 个服务端 / 客户端介入点盘点与归属建议；**分析基线，非实施授权**

## 已落地方案（历史决策，不是待做清单）

按时间：

1. [MVP 云开发台账](./plans/2026-09-10-mvp-cloudbase-redesign.md) — 协同闭环基线；范围已被后续超过  
2. [空间与位置](./plans/2026-09-10-next-spaces-locations.md)  
3. [A→B→C 路线图](./plans/2026-09-10-next-abcd-roadmap.md) — **A/B/C 已做完**；D 与对话仍后置  
4. [A 波详情/性能](./plans/2026-09-10-next-a-item-detail-perf.md)  
5. [命名主题](./plans/2026-09-15-family-theme-system.md)  
6. [家庭页 / 货架清单 / 口袋 as-built](./plans/2026-09-17-as-built-surfaces.md)  
7. [云函数读缓存](./plans/2026-09-16-cloud-call-cache/方案.md)  
8. [AI 助手 V2](./plans/2026-09-17-ai-assistant-v2/README.md) — 已实施（`packageAiAssist` + `ai.act`）  
9. [AI 助手 V3](./plans/2026-09-22-ai-assistant-v3/README.md) — 已落地；归档 `2026-09-23-ai-assistant-v3`  
10. [AI 上下文 / 查库 / prompt](./plans/2026-09-22-ai-assist-context-retrieval/README.md) — 已落地  
11. [管家素养课表](./plans/2026-09-23-ai-assist-curriculum/README.md) — 实施中（`ai-assist-curriculum`）  
12. [AI 拍照录入 V1](./plans/2026-09-16-package-ai-capture/README.md) — **已退役**；历史见 archive `2026-09-17-package-ai-item-capture`  

## 愿景（不要当本阶段范围）

- [PRD](./PRD-家庭物资管理小程序.md) v1.2（角色权限、采购、OCR 等）  
- [功能清单](./家庭物资管理小程序-功能清单.md)  
- [技术架构](./技术架构-家庭物资管理小程序.md) v1.1（含 ES 搜索等未采用项）  
- [AI 对话助手（09-07）](./plans/2026-09-07-ai-assistant-design.md) — 半屏聊天 + LangGraph；**不是** V2。现行助手见上节  
- HTML 原型：仓库根目录 `family-supplies-prototype*`  

## 第一阶段还剩

用户体系、搜索 UI。AI 助手 V2 已落地；旧拍照录入 V1 已退役。细节见现状快照。
