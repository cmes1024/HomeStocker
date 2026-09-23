## 1. Data and entitlements config

- [x] 1.1 在 `miniprogram/cloud/collections.md` 追加 `redeemCodes` / `familySubscriptions` 字段、索引、客户端 deny；注明 `families.itemCount` 与可选 `entitlement` 快照
- [x] 1.2 新增共享模块 `entitlements`（`PLANS` / `PRODUCTS` / `resolveLimits` / `isSubscriptionActive`）；free `familyLimit=1` / `memberLimit=2` / `itemLimit=50`，`capacity_std` 三项不限
- [x] 1.3 确认与 `docs/plans/2026-09-21-capacity-membership-redeem/` 一致；旧 AI 兑换 change 不实施

## 2. Item count + capacity gate

- [x] 2.1 `item.create` / `createMany` / `remove`（及解散删物资路径）维护 `families.itemCount`；缺失时懒 `count()` 校准一次
- [x] 2.2 实现 `assertItemCapacity`：读 `familySubscriptions`（无/过期 → free）；`createMany` 超剩余整批失败；错误码 `ITEM_LIMIT_REACHED`
- [x] 2.3 确认 `item.list` / `search` / 首页聚合**不**查询订阅

## 3. Redeem APIs and cleanup

- [x] 3.1 在 `family` 实现 `getEntitlement` / `redeem` / `issueCodes`（`ADMIN_OPENID`）；码哈希；防双兑；续期；刷新 `families.entitlement`
- [x] 3.2 `family` 解散清理删除该家 `familySubscriptions`
- [x] 3.3 AI `extract` / `transcribe` / `act` **不加**容量订阅硬闸

## 4. Client UI

- [x] 4.1 `getMyFamily` 返回 `itemCount` + entitlement 展示字段
- [x] 4.2 家庭页「加强版」行：状态/到期/件数进度、兑换入口；文案仅内测兑换
- [x] 4.3 撞限与兑换成功文案；兑换后作废家庭相关读缓存

## 5. Ops and verify

- [x] 5.1 控制台建集合与安全规则；配置 `ADMIN_OPENID`；部署相关云函数
- [x] 5.2 手测：50 件拦截 → 发码兑换放行 → 续兑延长 → 过期回落不删物资 → 解散清订阅 → 非 admin 不能发码 → 读路径无额外 entitlement 风暴

## 6. Free tier: 1 home / 2 seats / 50 items

- [x] 6.1 扩展 `entitlements.js`（item/family/ai 三份一致）：`resolveLimits` 返回 `familyLimit` / `memberLimit` / `itemLimit`；刷新 `families.entitlement` 快照字段
- [x] 6.2 `assertUserFamilyCapacity`：接入 `family.create` / `join`；无任一家有效加强版时拒第 2 家；错误码 `FAMILY_LIMIT_REACHED`
- [x] 6.3 `assertMemberCapacity`：接入 `family.join`；免费第 3 人拒绝；错误码 `MEMBER_LIMIT_REACHED`；过限不踢人
- [x] 6.4 `getEntitlement` / 家庭页文案：展示人数进度（可选）与三类撞限提示；更新 `collections.md` / acceptance-checklist
- [x] 6.5 手测补：1 家 / 2 人拦截 → 兑码后放行 → 过期回落不踢人
