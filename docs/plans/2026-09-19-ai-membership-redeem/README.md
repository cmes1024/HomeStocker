# AI 会员：闲鱼兑换码 + 家庭绑定

> 目录：`docs/plans/2026-09-19-ai-membership-redeem/`  
> 日期：2026-09-19  
> 状态：**方案定稿 / OpenSpec 产物齐全，待写代码**（change：`openspec/changes/ai-membership-redeem/`）  
> 性质：个人小程序主体无法开通微信支付时的 **MVP 会员路径**；不是完整定价矩阵

## 怎么读

| 文件 | 用途 |
|------|------|
| [`README.md`](./README.md) | 本文：结论、与 VIP 愿景关系 |
| [`方案.md`](./方案.md) | 绑定规则、集合、云函数闸门、兑换 UI |

## 一句话

闲鱼卖季卡兑换码 → 小程序内核销到**当前家庭** → 该家全员可用 AI（V1 录入 / V2 管家）；模型仍走家庭 BYOK。

## 与其它文档

| 文档 | 关系 |
|------|------|
| [`../VIP/`](../VIP/) | Trae 辅助起草的**愿景参考**（套餐矩阵、虚拟支付、usageLogs 等）；可吸收想法，**不是**实施合同。冲突时以本目录 + `openspec/changes/ai-membership-redeem/` 为准 |
| [`../2026-09-16-package-ai-capture/`](../2026-09-16-package-ai-capture/) | V1：`extract` / `transcribe` 加订阅闸门；密钥 CRUD 不加 |
| [`../2026-09-17-ai-assistant-v2/`](../2026-09-17-ai-assistant-v2/) | V2：`act` 加同一闸门 |
| `miniprogram/cloud/collections.md` | 实现时合入 `redeemCodes` / `familySubscriptions` |

## 从 VIP 愿景吸收 / 明确不做

**已对齐（写入本方案）：** 按家庭卖、全员共享；闸门只在云函数；台账核心能力保持免费；权益表预留 `source` 以便日后接支付；解散清订阅。

**看过但本刀不做（仍以本方案为准）：** 微信虚拟支付 / 订单表；免费日额度与 V2 体验赠送；BYOK 跳过会员闸（本刀 BYOK 仍要有效订阅，摊的是云函数成本）；物资/空间/主题数量上限；usageLogs 与成本熔断；到期订阅消息续费提醒（可后置）。
