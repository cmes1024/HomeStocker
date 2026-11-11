# Why

家庭加强版目前只能由运营人工发兑换码，用户侧没有增长入口。希望让已有家庭的用户通过微信分享邀请**从未拥有过家庭**的新用户，新人首次建家后自动给邀请者的家庭延长加强版有效期。

约束：VIP 仍是家庭级订阅（不引入用户级权益）、不改任何容量闸门、发奖失败不能影响新人建家、原邀请码加入家庭的链路保持不变、本地联调不碰生产。

## What Changes

- 新增 `users.has_ever_had_family` 不可逆标记（迁移时回填存量已建家用户）。
- 新增 `invite_links` / `invite_activations` 两张表；奖励仍写 `family_subscriptions`（`source=invite`）。
- 新增 `POST /api/family/{getInviteLink,createInviteLink,claimInvite}`；`family.create` 增加可选 `inviteToken`。
- `family.create` / `family.join` 内用 CAS 把「首次拥有家庭」固化；仅 create 写归因 pending。
- 发奖在独立事务：校验链接/家庭/成员/上限后叠加续期，失败只记 skipped 或日志。
- 小程序家庭页新增分享入口与链接状态；`onboarding` 支持 `inviteToken` 并直接进「创建家庭」模式。
- 新增单元用例、端到端场景脚本与 PRD/测试文档。

## Capabilities

### New Capabilities
- `invite-reward`: 长期分享链接、不可逆新人判定、一人一次激活、家庭订阅叠加续期、上限与异常兜底。

### Modified Capabilities
- 无（既有 `capacity-membership-redeem` 门控与 `family-membership` 行为合同不变）。

## Impact

- 数据：Flyway V10 新增 2 表 + 1 列 + 存量回填；不删旧数据。
- 接口：新增 3 个 action；`family.create` 新增可选入参，返回值不变。
- 前端：家庭页新增分享区；`onboarding` 支持新 query 参数；读缓存登记一项。
- 运维：参数可由 `INVITE_*` 环境变量调整；回滚只需关闭入口并停用 active 链接。
