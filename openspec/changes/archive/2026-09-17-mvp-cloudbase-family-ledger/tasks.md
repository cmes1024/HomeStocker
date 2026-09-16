## 1. 数据与安全基线

- [x] 1.1 在仓库中补充集合/字段说明与索引清单（users / families / memberships / items），对齐设计文档
- [x] 1.2 编写云数据库安全规则草案：users 读本人；families/memberships 客户端写 deny；items 客户端写 deny、读限当前家庭
- [x] 1.3 记录控制台需手工创建的唯一/复合索引（inviteCode；memberships openid/familyId/复合唯一；items familyId+updatedAt）

## 2. 云函数 family

- [x] 2.1 新建 `cloudfunctions/family`（package.json + wx-server-sdk），按 action 分发
- [x] 2.2 实现 create：生成 6 位邀请码、写 family + membership、设 currentFamilyId；已有 membership 返回 ALREADY_IN_FAMILY
- [x] 2.3 实现 join：按 inviteCode 查家庭、写 membership、维护 memberCount、设 currentFamilyId
- [x] 2.4 实现 getMyFamily：OPENID → currentFamilyId + membership 校验后返回摘要
- [x] 2.5 实现 leave/dissolve：非 owner 离开；owner 解散时清理 memberships、items、currentFamilyId

## 3. 云函数 item

- [x] 3.1 新建 `cloudfunctions/item`，按 action 分发；统一 `{ ok, data | code, message }`
- [x] 3.2 实现 create/update/remove：家庭取自服务器 currentFamilyId + membership；source 默认 ui
- [x] 3.3 实现 get 与 search（当前家庭内按 name 简单匹配）；禁止信任入参 openid/familyId

## 4. 客户端工具与启动壳

- [x] 4.1 新增 `utils/session.js`：确保 users 文档、读取 membership / currentFamilyId
- [x] 4.2 新增 `utils/cloud.js`：`callFamily` / `callItem` 封装
- [x] 4.3 新增 `utils/db.js`：items 列表直连读（按 familyId + updatedAt）
- [x] 4.4 更新 `app.js` / 启动路由：无 membership → onboarding；有家庭 → items；保留 cloud.init(traceUser)

## 5. 页面

- [x] 5.1 实现 `pages/onboarding/index`：创建家庭 / 输入邀请码加入；错误态 ALREADY_IN_FAMILY / 无效码
- [x] 5.2 实现 `pages/items/index`：列表、失败重试、跳转编辑/新增、入口到家庭页
- [x] 5.3 实现 `pages/items/edit`：名称/数量/备注表单，经 callItem 写
- [x] 5.4 实现 `pages/family/index`：展示邀请码与复制、成员数、离开/解散

## 6. 导航裁剪与验收

- [x] 6.1 更新 `app.json`：注册 MVP 页面为入口；移除 demo/chat 产品路径；保留 chatProxy 目录不挂导航
- [x] 6.2 自检双账号闭环清单：创建→邀请→加入→双方 CRUD→客户端无法直写 items→已有 membership 再 join/create 被拒→解散回 onboarding
