# AI 会员：闲鱼兑换码 + 家庭绑定（已 superseded）

> 目录：`docs/plans/2026-09-19-ai-membership-redeem/`  
> 日期：2026-09-19  
> 状态：**已被取代** — 请改读 [`../2026-09-21-capacity-membership-redeem/`](../2026-09-21-capacity-membership-redeem/)  
> 原因：AI 走 BYOK 后对云开发账单影响很小；会员改为卖**物资容量**以摊云套餐成本。兑换码/绑家/发码骨架仍可复用。

## 一句话（历史）

闲鱼卖季卡 → 核销到家庭 → 闸 AI V1/V2。该叙事不再作为实施合同。

## 与现行方案

| 文档 | 关系 |
|------|------|
| [`../2026-09-21-capacity-membership-redeem/`](../2026-09-21-capacity-membership-redeem/) | **现行 MVP** |
| `openspec/changes/ai-membership-redeem/` | 旧 change，勿再按「只闸 AI」实施 |
| [`方案.md`](./方案.md) | 仅作兑换/哈希/防双兑参考 |

## 从本目录仍可复用的决策

按家庭卖、全员共享；码只存哈希；条件更新防双兑；续期从 max(现到期, now) 起算；解散清订阅；`source` 预留支付。
