基线（2026-10-24）：release-smoke 15/16 · daily-use 32/35 · day-flow 2/3

# B0 基线（零行为改动）

- 分支：`feature/ai-decision-authority`（从 main 切出）
- 代码状态：仅删除死代码（`Guardrails` 全类 + `AiActService` 21 个无调用点方法），无行为改动
- 编译 / 单测：编译通过；`mvn test` 164 passed / 0 failed
- 测试家庭：`eval-curriculum`（family `ff9b0c52-2513-4e45-84f3-537dcfbf18fc`，单成员，专用 eval 家庭）
- 接口：`http://localhost:8080/api/ai/act`，`AI_ACT_RATE_PER_MINUTE=200`，未撞 429

## 三份 plan

| plan | 通过 | 落盘目录 |
|---|---|---|
| release-smoke | **15/16** | `release-smoke/` |
| daily-use | **32/35** | `daily-use/` |
| day-flow | **2/3** | `day-flow/` |

## 失败题（B0 不改行为，均为模型表现现状）

| plan | 题 | 失败断言 | 现象 |
|---|---|---|---|
| release-smoke | `scene-want-coffee` | `requiredTool:item.search` | 未查库直接说「台账里没查到咖啡」 |
| daily-use | `user-expire-fridge-deal` | `forbiddenTool:item.removeMany` | 临期处理误触发批量移除 |
| daily-use | `user-undo-revoke` | `requiredTool:item.update` | 撤销类句子未落到写调用 |
| daily-use | `user-use-milk-drank` | `mustAsk` | 未澄清直接用掉 |
| day-flow | `user-day-home` | `requiredTool:item.update` | 一天多轮里本轮未落写调用 |

## 环境备注

- 入场时该测试家庭的 `family_subscriptions.hosted_model_until` 已过期（2026-10-17），首轮 act 全部 `NO_AI_KEY`；
  已把本测试家庭的 hosted 资格续到 2026-12-23（仅本地测试库数据，未改代码），之后才开始采集基线。
