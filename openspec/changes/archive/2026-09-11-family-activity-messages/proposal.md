## Why

B 波已补齐标签、保质期与临期提醒，但物资增删改仍是「静默」的：成员看不到谁改了什么，协同缺少「人味」。C 波按路线图交付物品改动活动日志，并在家庭消息中展示，让共享台账可感知彼此操作。

## What Changes

- 物资 **create / update / remove** 成功后写入家庭级活动记录（谁、何时、对哪件物资、做了什么；更新可带关键字段摘要）
- 家庭页（或家庭消息入口）展示按时间倒序的消息流；仅当前家庭、仅成员可读
- 物资详情可展示该物资最近若干条操作（同一数据源，按 `itemId` 过滤）
- 解散/退家等家庭清理路径同步清理该家活动记录
- **不做（本 change）**：软删除物资本体（仍硬删，仅保留活动快照）、评论/点赞/@、空间/标签/背景等非物资写事件、推送订阅（非临期类）、对话 Agent UI、为新而新的交互实验（D）

## Capabilities

### New Capabilities

- `item-activity-log`: 物资增删改成功后写入活动事件；按家庭/物资查询；解散清理
- `family-message-feed`: 家庭消息流 UI（家庭入口 + 详情最近操作）

### Modified Capabilities

- （无；主库现有 capability 为 B 波标签/保质期，本 change 不改其需求文本。实施时扩展现有 `item` 写路径与家庭页。）

## Impact

- 小程序：家庭页消息流区块或子页；详情「最近操作」；文案与切家刷新
- 云函数：扩展 `item` create/update/remove 旁路写活动；新增 `activity`（或等价）list 读接口；`family` 解散清理活动集合
- 文档库：新集合（建议 `activities`）；索引 `familyId+createdAt`、`itemId+createdAt`；客户端写 deny
- 文档：回写 `collections.md`、`acceptance-checklist.md`、`AGENTS.md` 下一版指针（C 为当前焦点）
- Agent 预留：活动由同一 `item` 写入口产生，不另套改库；Agent 写入的物资同样留痕（可标 `source`）
