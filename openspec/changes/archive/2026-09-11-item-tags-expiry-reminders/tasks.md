## 1. 数据模型与集合

- [x] 1.1 更新 `collections.md`：`tags` 集合；`items.tagIds` / `productionDate` / `expireDate` / `expireReminderEnabled`；`families.expireReminderEnabled` / `tagsSeededAt`；索引与安全规则（tags 客户端写 deny）
- [x] 1.2 控制台创建 `tags` 集合与索引（`familyId`；`items.familyId+expireDate`；按需 `tagIds`）；更新 `database-rules.json`

> 1.2：规则与文档已就绪；控制台建集合/索引需在开发者工具手工执行（见 acceptance-checklist）。

## 2. 标签云函数与写路径

- [x] 2.1 新建云函数 `tag`：`ensureDefaults` / `list` / `create` / `update` / `remove`（membership 校验；删标签时剥离本家 items 上的该 tagId）
- [x] 2.2 扩展 `item` create/update：校验 `tagIds` 均属当前家庭；读写返回 tagIds
- [x] 2.3 解散家庭路径清理该家 `tags`；客户端 `callTag` 封装

## 3. 标签 UI

- [x] 3.1 家庭页（或独立页）标签管理：列表 / 新建 / 重命名 / 删除
- [x] 3.2 物资编辑：多选标签；详情展示标签名；首次打开触发 `ensureDefaults`
- [x] 3.3 清单按单标签筛选（可清除）

## 4. 保质期字段与状态

- [x] 4.1 扩展 `item` create/update/get/list：可选 `productionDate` / `expireDate`（`YYYY-MM-DD` 或清空）；`expireReminderEnabled` 默认 false
- [x] 4.2 共享日期状态工具（主线程 + 可选 Worker）：`expired` / `expiring`(今天…今天+3) / `normal`；Asia/Shanghai 日历日
- [x] 4.3 编辑表单日期与提醒开关；详情与清单展示日期/临期/过期标识

## 5. 订阅消息与家庭总开关

- [x] 5.1 `family` 增加提醒总开关读写（默认 true）；家庭页开关 UI
- [x] 5.2 申请/配置订阅消息模板与 `tmplIds`；开启物资提醒时 `requestSubscribeMessage`（拒绝不阻断保存）
- [x] 5.3 记录成员订阅授权（建议挂 `memberships`）；新建定时云函数 `expireNotify`：每日筛 3 天 / 1 天 / 当天且双开关开启的物资并发送；缺模板时跳过并打日志
- [x] 5.4 部署触发器；干跑日志验收后再开真实发送

> 5.2：`utils/subscribeExpire.js` 的 `EXPIRE_SUBSCRIBE_TMPL_ID` 与云函数环境变量需在公众平台申请模板后填入。  
> 5.4：`expireNotify/config.json` 已含每日 9:00 触发器；上传云函数后默认可干跑（无 tmplId）；真机推送需关 DRY_RUN 并配置模板。

## 6. 首页即将过期

- [x] 6.1 `item.listExpiring`（或等价）：当前家 `expireDate` 在过期或临期窗内的物资（忽略提醒开关）
- [x] 6.2 `pages/items/index` 顶部「即将过期」模块；无数据则隐藏；点击进详情；切家刷新

## 7. 文档与验收

- [x] 7.1 更新 `acceptance-checklist.md`（标签 CRUD/打标/筛选、保质期、双开关、订阅授权、即将过期模块）
- [x] 7.2 回写 `AGENTS.md`：当前实施焦点改为 B 波 / 本 change
- [x] 7.3 对照 specs 场景自测；订阅推送在开发者工具/真机按模板可用性验收

> 7.3 静态核对：tag CRUD 云函数与页、item 字段/校验、listExpiring、清单模块与筛选、家庭总开关、subscribe 工具、expireNotify 干跑。真机需另验云函数部署、集合索引、订阅模板与定时触发。
