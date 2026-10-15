## Context

容量兑换已经把 `expires_at` 写在 `family_subscriptions` 上，发码在家庭页，且仅 `ADMIN_OPENIDS` 可见。管家密钥在 `family_ai_keys`，调用时默认优先、最多再试一把。平台和模型来自 `ModelCatalog`。见 proposal.md。

## Goals / Non-Goals

**Goals:**

- 发码选填授予平台模型，核销后两个到期时间互不影响。
- 管理员在家庭页维护全站平台密钥池，调用按顺序自动换，一轮最多两把。
- 密钥页用同一套「设为默认」在会员模型和自备密钥之间切换，并显示有效期。

**Non-Goals:**

- 微信支付、自动续费、按 token 计费账单。
- 平台密钥与自备密钥在同一次请求里混用。
- 把平台密钥算进家庭 3 把上限，或按家庭复制平台密钥。

## Decisions

### 两个时钟，而不是一个布尔开关

`family_subscriptions` 增加 `hosted_model_until`。容量核销仍只改 `expires_at`。码上增加 `hosted_model boolean default false`。只有码带该标记时，才把 `hosted_model_until` 设为 `max(原值, now) + days`。

容量 `upsert` 不得把 `hosted_model_until` 写成空。现有冲突更新只改容量字段，新列不放进那条 `SET`。

另增 `model_source`：`hosted` 或 `family`，默认空。空且没有自备密钥、会员模型仍有效时，有效来源是会员模型。成员把自备密钥设为默认时写入 `family`；把会员模型设为默认时写入 `hosted`。会员模型过期后，有效来源回到仍标记为默认的那把自备密钥，不清除各把密钥自己的默认标记。

备选是让最后一次兑换的标记覆盖整个订阅。那样一张纯容量码会提前关掉还没到期的会员模型，和「选填、分开控制」不符。

### 平台池是全站一张表

新表 `platform_ai_keys`：`id`、`provider`、`model`、`api_key`、`label`、`position`、`enabled`、时间戳。不挂 `family_id`。地址只从 `ModelCatalog` 解析，请求里的 `baseUrl` 丢弃。最多 8 把。

接口放在 `ai` 下，每次用现有 `isCapacityAdmin` 校验。列表掩码与家庭密钥相同（前 3 后 4）。明文只在添加时进入服务端。

家庭页在发码行下面加「平台模型」，仅 `family.isAdmin` 时渲染。发码弹层加一个「包含平台模型」开关，随 `issueCodes` 提交 `hostedModel`。

备选是环境变量列表。改密钥要重启，也没有和发码入口一样的页面。

### 调用只取一个来源，平台侧另算冷却

有效来源是自备密钥时，沿用现在的两把顺序，余额不足不换下一把。

有效来源是会员模型时，取 `enabled`、按 `position`、跳过冷却中的，最多两把。超时、连接失败、401、429、5xx、余额不足：当前把进入 60 秒冷却并试下一把。计划不是合法 JSON 时仍在当前把上修复一次。两把都失败返回「助手暂时不可用，请稍后重试」。

冷却放在进程内。本地 Docker 单实例够用。多实例以后再放到 Redis，本刀不引入新的共享状态。

`listKeys` 增加 `hosted`：`active`、`expiresAt`、`isDefault`、`expired`。没有 `hosted_model_until` 时字段为空，页面不渲染那一行。

## Risks / Trade-offs

- [管理员明文密钥经过小程序请求] → 与自备密钥同一通道；列表与日志不回明文。
- [进程内冷却在重启后丢失] → 下一轮仍会按失败再冷却；单实例可接受。
- [平台余额不足会多打一把] → 一轮上限两把，和现有延迟预算一致。
- [未归档的多平台密钥变更也改了「Keys also serve assistant act」] → 本变更的 delta 保留跨平台换钥匙、400 不换、自备密钥余额不足不换，避免后归档时丢掉已落地行为。

## Migration Plan

1. Flyway 加列和 `platform_ai_keys`。旧码视为 `hosted_model = false`。旧订阅 `hosted_model_until` 为空。
2. 先上服务端，再上家庭页和密钥页。未升级的小程序发码不传标记，行为与现在相同。
3. 回滚应用时新列可留着；回滚后发码不写标记，调用不再读平台池。

## Open Questions

无。冷却时长取 60 秒，池上限 8，都写进本设计，不改变规格里的可观察行为。
