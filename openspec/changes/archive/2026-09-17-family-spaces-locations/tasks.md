## 1. 数据与安全基线

- [x] 1.1 更新 `miniprogram/cloud/collections.md`：补充 `spaces` / `locations` 字段、`items.spaceId` / `locationId`、索引清单
- [x] 1.2 更新云数据库安全规则草案：`spaces` / `locations` 客户端写 deny、读限当前家庭成员；与现有 items 规则对齐
- [x] 1.3 记录控制台需手工创建的索引：`spaces.familyId`；`locations.spaceId`（及 `familyId`）；`items.familyId+spaceId`；`items.locationId`
- [x] 1.4 回写 `AGENTS.md`：下一版空间/位置纳入当前范围说明与数据模型摘要

## 2. 云函数 space

- [x] 2.1 新建 `cloudfunctions/space`（package.json + wx-server-sdk），按 action 分发，统一 `{ ok, data | code, message }`
- [x] 2.2 实现 `ensureDefault`：家庭无空间时创建「仓库」(`isDefault: true`)；已有则返回默认或首个空间；可选回填无 `spaceId` 的旧物资
- [x] 2.3 实现空间 `list` / `create` / `update` / `remove`：身份取 OPENID + currentFamilyId + membership；默认仓库不可删（`DEFAULT_SPACE`）；删光最后一个空间返回 `LAST_SPACE`；其它空间删除时物品迁到默认仓库并清空位置
- [x] 2.4 实现位置 `listLocations` / `createLocation` / `updateLocation` / `removeLocation`：校验 location 所属 space 属当前家庭

## 3. 扩展云函数 item 与 family

- [x] 3.1 扩展 `item` create：解析/校验 `spaceId`（可空则 ensureDefault）；校验可选 `locationId` 属于该 space；写入字段
- [x] 3.2 扩展 `item` update：可改 `spaceId` / `locationId`；换空间时清空或重绑合法 location；拒绝跨空间 location
- [x] 3.3 扩展 `item` get/search/列表消费方所需字段，保证返回 `spaceId` / `locationId`
- [x] 3.4 扩展 `family` dissolve：按 `familyId` 清理 `spaces` 与 `locations`

## 4. 客户端工具

- [x] 4.1 `utils/cloud.js` 增加 `callSpace(action, payload)`
- [x] 4.2 `utils/db.js` 增加读 spaces 列表、按 spaceId 读 locations、按 familyId+spaceId 读 items（含位置名 join 或二次查询）

## 5. 物资编辑 / 新增

- [x] 5.1 编辑页加载当前家庭空间列表；无空间时依赖 create 路径静默仓库（或进入页时 ensureDefault）
- [x] 5.2 表单增加空间选择；位置为可选（本空间已有位置下拉 +「新建位置」调用 createLocation）
- [x] 5.3 提交经 `callItem` 写入 `spaceId` / `locationId`；错误态提示无效空间/位置

## 6. 空间浏览页与入口

- [x] 6.1 新增 `pages/spaces/index`：当前家庭空间列表；支持进入新建/改名（最小 CRUD UI）
- [x] 6.2 新增 `pages/spaces/detail`：默认氛围底图（模糊）+ 该空间物资清单；行内展示位置名（有则显示）
- [x] 6.3 `app.json` 注册空间页面；准备默认氛围静态资源
- [x] 6.4 家庭页增加「逛空间 / 家庭空间」入口模块，跳转空间列表

## 7. 验收与可选

- [x] 7.1 自检成功标准：首次加物资→自动仓库；自定义空间并挪动物资；家庭入口→空间列表→单空间清单；全家清单仍可用；解散清理 spaces/locations
- [x] 7.2 （可选）全家物资列表按空间筛选
- [x] 7.3 （可选）空间列表内删除/改名完整交互与空态文案打磨
