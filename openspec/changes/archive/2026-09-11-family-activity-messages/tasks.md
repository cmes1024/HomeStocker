## 1. 数据模型与规则

- [x] 1.1 更新 `collections.md`：新增 `activities` 集合字段（`familyId` / `itemId` / `action` / `actorOpenid` / `itemName` / `changedFields?` / `summary?` / `source` / `createdAt`）；索引 `familyId+createdAt`、`itemId+createdAt`；说明硬删物资后仍保留 remove 快照
- [x] 1.2 更新 `database-rules.json`：`activities` 客户端写 deny；成员可读本家（或读也走云函数则客户端读 deny）；验收清单注明控制台建集合/索引

> 1.2：规则与文档已就绪；控制台建集合/索引需在开发者工具手工执行（见 acceptance-checklist）。

## 2. 写路径：item 旁路留痕

- [x] 2.1 在 `item` create 成功后写入 `action=create` 活动（含 `itemName`、`actorOpenid`、`source`）；失败创建不写
- [x] 2.2 在 `item` update 成功后 diff 关键字段，有变更则写 `action=update` + `changedFields`/`summary`；无有效变更可跳过；活动插入失败只打日志不回滚物资写
- [x] 2.3 在 `item` remove 成功后写 `action=remove`（名称快照）；`family` 解散路径按 `familyId` 清理 `activities`

## 3. 读路径：activity 云函数

- [x] 3.1 新建云函数 `activity`：`list`（当前家 membership 校验；可选 `itemId`；倒序分页；可附带 actor nickname）
- [x] 3.2 客户端 `callActivity`（或等价）封装；统一错误码与空列表

## 4. 家庭消息 UI

- [x] 4.1 家庭页增加「家庭消息」入口；子页（或等价）展示倒序消息流；切家刷新
- [x] 4.2 行展示：actor 标签（无昵称→「家人」）、动作文案、物资名、时间、更新变更提示；空态与错误重试；无评论/发帖框
- [x] 4.3 文案接入 `utils/copy.js`

## 5. 详情最近操作

- [x] 5.1 物资详情按 `itemId` 拉取最近若干条活动并展示；无数据时隐藏或轻提示；不阻断详情主信息

## 6. 文档与验收

- [x] 6.1 更新 `acceptance-checklist.md`（增删改留痕、家庭消息流、详情最近操作、解散清理、跨家隔离）
- [x] 6.2 回写 `AGENTS.md`：当前实施焦点改为 C 波 / 本 change；数据模型补 `activities`
- [x] 6.3 对照 specs 场景自测；确认无软删除物资本体、无聊天 compose

> 6.3 静态核对：`item` 旁路写 activities、`activity.list`、家庭消息页无 compose、详情 recentOps、解散清理 activities、硬删保留快照。真机需另验云函数部署、集合与索引。
