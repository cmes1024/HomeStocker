## ADDED Requirements

### Requirement: 分享链接生成

已有家庭的用户 SHALL 能生成一条长期有效的分享链接，链接 SHALL 在服务端绑定邀请者 openid 与生成时冻结的奖励落点家庭；客户端 SHALL NOT 指定奖励落点。

#### Scenario: 无家庭时拒绝生成
- **WHEN** 从未拥有家庭的用户调用 `createInviteLink`
- **THEN** 返回 `NO_FAMILY`，不生成链接

#### Scenario: 重新生成
- **WHEN** 用户显式重新生成链接
- **THEN** 旧链接置为 inactive、新链接生效，且累计激活次数与天数不重置

### Requirement: 新人判定不可逆

系统 SHALL 以「从未拥有过家庭」定义新人，并在首次 `family.create` 或 `family.join` 时以原子方式置不可逆标记；`leave` 或解散家庭 SHALL NOT 使标记回退。

#### Scenario: 离开后不能重新变成新人
- **WHEN** 老用户 `leave` 后再次建家并携带分享 token
- **THEN** 不产生归因记录，不发放奖励

### Requirement: 有效激活与一人一次

仅当新人**首次建家成功**时 SHALL 计为一次有效激活；仅打开链接 SHALL NOT 发放奖励。一个 openid SHALL 最多贡献一次奖励，不论链接数量。

#### Scenario: 一链多人
- **WHEN** 三个不同新人各自携带同一 token 完成首次建家
- **THEN** 三次均计为有效激活，邀请者家庭订阅叠加三次

#### Scenario: 同一新人重复
- **WHEN** 同一 openid 再次建家或再次调用 `claimInvite`
- **THEN** 不再产生奖励

### Requirement: 奖励落在家庭并叠加续期

奖励 SHALL 写入链接冻结的家庭的 `family_subscriptions`（`planId=capacity_std`、`source=invite`），到期时间 SHALL 为 `max(现有到期, now) + days`。家庭已有订阅记录时 SHALL 只更新 `expires_at`，SHALL NOT 覆盖 `product` / `source` / `last_redeem_code_id`。

#### Scenario: 已有有效订阅
- **WHEN** 家庭已有一份未过期加强版
- **THEN** 从原到期日往后叠加，不从当前时间重算

### Requirement: 发奖失败不影响建家

归因写入 SHALL 在首次建家事务内完成，奖励发放 SHALL 在独立事务内完成。奖励落点消失、外键异常或任何未知异常 SHALL NOT 导致新人建家失败。

#### Scenario: 奖励家庭已解散
- **WHEN** 邀请者解散了链接绑定的家庭后，新人携带该 token 建家
- **THEN** 新人建家与 membership 完整，激活记为 `skipped`（`FAMILY_GONE` 或 `INVITER_LEFT`）

### Requirement: 上限与风控

系统 SHALL 按邀请者 openid 全局统计时间窗内的成功激活次数；达到次数上限 SHALL NOT 继续发奖；自邀 SHALL NOT 发奖。每次有效激活 SHALL 固定发放配置天数，累计天数 SHALL NOT 封顶。

#### Scenario: 次数封顶
- **WHEN** 30 天窗口内已有 5 次成功激活
- **THEN** 第 6 次记为 `ACTIVATION_LIMIT`

#### Scenario: 累计天数不封顶
- **WHEN** 时间窗内已累计发放 28 天
- **THEN** 本次仍发放配置的完整天数，`grantedDays` 继续累加

### Requirement: 原邀请链路不变

分享奖励 SHALL NOT 改变 `inviteCode` → `family.join` 的行为；被邀请加入他人家庭的用户 SHALL 被标记为老用户，且 SHALL NOT 计入分享奖励。

#### Scenario: 加入他人家庭
- **WHEN** 新人通过 6 位邀请码加入某家庭
- **THEN** 加入成功、不可逆标记置位，且 `claimInvite` 返回 `none`
