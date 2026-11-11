# Design — share-invite-reward

## 关键决策

1. **VIP 落家庭，不落用户**：现有 `family_subscriptions` 以 `family_id` 为主键，`CapacityPlans` 的限额全是家庭资源。用户级权益无法门控，且会与「按家庭卖、全员共享」的产品原则冲突。
2. **新人 = 从未拥有过家庭**：`users.has_ever_had_family` 由 CAS 置位，永不回退；`memberships` 保持物理删除语义，避免影响 `countByOpenid` 家数闸门。
3. **pending 中间态**：`claimInvite` 在建家成功后才调用，此时新人标记已是 true，无法再判断「首次」。因此在 `family.create` 事务内用 CAS 得出首次结论，随即写一条无外键的 `invite_activations(pending)`；发奖事务消费它。
4. **事务解耦**：`family_subscriptions.family_id` 有外键到 `families`。若发奖与建家同事务，家庭被解散时的外键错误会让 PostgreSQL 整个事务失败、连累 B 建家。故 B 的 `family.create` 独立提交，发奖另起事务；幂等靠 `invitee_openid` 主键 + `SELECT ... FOR UPDATE`。
5. **链接存明文随机 token**：链接本身是公开分享物，无保密要求；存明文才能在家庭页重复读取现有链接，不必每次重新生成。24 位字符集随机，不可枚举。
6. **计数在人这一层**：加强版允许多家庭，若按家计上限会被放大 N 倍；发奖落点是家、计数与去重是 openid。
7. **独立 `InviteController`**：与 `FamilyService` 解耦，避免双向依赖；路径仍为 `/api/family/{action}`。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 微信不提供接收方身份，归因靠客户端带 token | 服务端按 token 反查全部信息；客户端不能传奖励落点 |
| 批量全新小号 | 一人一次 + 次数/天数封顶 + `skipped` 留痕；更强风控列为后置 |
| 发奖异常 | Controller 吞异常返回 `skipped/ERROR`，pending 保留可重试 |
| 老用户被误判为新人 | 迁移回填所有已有 membership 的用户 |
| 存量数据 | 生产已有家庭的几个用户会被标记为老用户，符合口径 |

## 不做

个人级 VIP、B 加入 A 的家计奖励、留存门槛与定时任务、设备指纹、链接自动迁移、`inviteCode` 一次性化、补偿或追回已发权益。
