# Tasks — share-invite-reward

## 1. 数据
- [x] 1.1 `V10__invite_reward.sql`：users 不可逆标记 + 存量回填 + 两张新表（均无到 families 的外键）
- [x] 1.2 确认存量回填不会把未建家用户误标为老用户

## 2. 后端
- [x] 2.1 `InviteRewardRules` 纯规则类 + 单测（校验优先级、次数上限、固定天数、叠加续期）
- [x] 2.2 `InviteLinkRepository` / `InviteActivationRepository`（幂等插入、行锁、统计）
- [x] 2.3 `InviteRewardService`：getInviteLink / createInviteLink / claimInvite / recordFirstFamilyPending
- [x] 2.4 `InviteController`：发奖异常兜底不抛给前端
- [x] 2.5 `UserRepository.markHadFamilyIfFirst` CAS
- [x] 2.6 `family.create` / `family.join` 接入 CAS；create 支持可选 `inviteToken`
- [x] 2.7 `application.yml` 参数化 `homestocker.invite.*`
- [x] 2.8 `InviteSettingsService` + `getInviteSettings` / `updateInviteSettings`：平台级开关与参数（`invite_settings` 表优先，运营页可改）
- [x] 2.9 `bootstrap.home` 兜底补发残留 `pending`，避免建家那次 claim 失败后奖励永久不发

## 3. 小程序
- [x] 3.1 家庭页分享按钮按 dataset 区分拉新链接与原邀请码
- [x] 3.2 家庭页链接状态、重新生成、上限提示
- [x] 3.3 `onboarding` 支持 `inviteToken`，直接进建家模式，建家成功后静默 claim
- [x] 3.4 `cloud.js` 登记 `getInviteLink` 为可缓存读
- [x] 3.5 文案与样式（避免利益诱导分享表述）

## 4. 测试与文档
- [x] 4.1 JUnit 全量 `mvn test`
- [x] 4.2 `server/scripts/invite-e2e.sh` 端到端场景脚本
- [x] 4.3 微信开发者工具 CLI 本地打开小程序验证（不连生产）
- [x] 4.4 PRD / 场景测试与用例 / 待决策事项
- [x] 4.5 AGENTS.md、docs/README.md 同步
- [x] 4.6 `openspec validate`

## 5. 上线前（不在本轮）
- [ ] 5.1 生产库 Flyway V10 执行确认与回填核对
- [ ] 5.2 合规文案按最新运营规范复核（见待决策事项）
