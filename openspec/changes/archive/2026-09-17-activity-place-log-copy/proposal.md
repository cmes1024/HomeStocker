## Why

家庭消息目前只留「谁 + 动作 + 物品名」，改动物资时最多提示改了「空间、位置」这类字段名。家人对账时看不到放在哪、加了多少，读起来不像「家人在厨房添加了盐*2袋」。

## What Changes

- 物资 create / update / remove 成功写 `activities` 时，快照当时的 **空间名、位置名**（有则写，无则空）
- create 额外快照 **数量、单位**
- 家庭消息与物资详情「最近操作」用同一套句式拼行；旧记录没有新字段时仍可读，只是少「在厨房」
- 不回填历史活动；不做字段前后对照审计；空间/标签本身的 CRUD 仍不进消息

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `item-activity-log`: create/update/remove 活动必须带地点快照；create 还带数量单位
- `family-message-feed`: 消息行必须用人、地点、名称拼成通顺中文句；create 带数量单位；update 带改了哪些项；remove 不要求数量

## Impact

- 云函数 `item`：旁路写活动时解析并写入 `spaceName` / `locationName`（及 create 的 `quantity` / `unit`）
- 文档库：`activities` 字段说明；无需新集合或新索引
- 小程序：家庭消息、物资详情最近操作共用拼句；`copy` 动词可微调
- 部署：需重新上传 `item` 云函数后新日志才带地点
