> SUPERSEDED：不实施。以 `capacity-membership-redeem` 为准。归档时任务保持未勾。

## 1. Data and docs alignment

- [ ] 1.1 在 `miniprogram/cloud/collections.md` 追加 `redeemCodes` / `familySubscriptions` 字段、索引、客户端 deny、换环境步骤
- [ ] 1.2 确认 `docs/plans/2026-09-19-ai-membership-redeem/` 与本 change 无冲突；实现完成后把计划 README 状态改为已合入

## 2. Cloud function: subscription core

- [ ] 2.1 在 `ai` 云函数增加产品常量、`requireAiSubscription`、`getSubscription`、`redeem`（条件更新防双兑）、`issueCodes`（`ADMIN_OPENID`）
- [ ] 2.2 `ensureCollections` 纳入两新集合；`extract` / `transcribe` / `act` 入口调用订阅闸门
- [ ] 2.3 `family` 解散清理增加删除 `familySubscriptions`

## 3. Client UI

- [ ] 3.1 家庭页增加 AI 会员行：拉 `getSubscription`、展示到期/未开通、`PromptDialog` 兑换
- [ ] 3.2 `copy` 增加兑换相关文案；录入/助手对 `SUBSCRIPTION_REQUIRED` 友好提示
- [ ] 3.3 分包 `callAi` 可调用 `getSubscription` / `redeem`（或经现有封装）

## 4. Ops and verify

- [ ] 4.1 控制台建集合与安全规则；云函数配置 `ADMIN_OPENID`；部署 `ai` / `family`
- [ ] 4.2 手测：发码 → 兑换 → extract/act 放行；无订阅拦截；续兑延长；解散清订阅；非 admin 不能发码
