## 1. Schema and write path

- [x] 1.1 更新 `collections.md`：`activities` 增加 `spaceName` / `locationName`（可空）、可选 `spaceId` / `locationId`；create 另有 `quantity` / `unit`
- [x] 1.2 `item` 云函数：`resolveLocationId` 返回位置文档；抽 `snapshotPlace`，create/update/remove 成功写活动时带地点快照
- [x] 1.3 create 活动写入 `quantity` / `unit`；update 用写后地点；remove 用删除前地点；解析失败不阻断物资写

## 2. Message copy

- [x] 2.1 新增共用 `formatActivityLine`：有地点则「在厨房」或「在厨房·冰箱」；create 为「名称*数量单位」；update 附 `summary`；缺字段不编造地点
- [x] 2.2 家庭消息与物资详情最近操作改用该拼句；create 动词改为「添加了」
- [x] 2.3 验收清单 C 波补一条：新增行含地点与数量，删除行含地点，更新行含地点与变更摘要

## 3. Specs

- [x] 3.1 将 delta 同步进 `openspec/specs/item-activity-log` 与 `family-message-feed`（或留待 archive）
