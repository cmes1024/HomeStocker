终验（2026-10-24，B1–B6 合并后）：release-smoke 16/17 · daily-use 34/35 · day-flow 3/4

# B1–B6 终验

对比 B0 基线（`ai-eval/runs/20261024T110259Z-baseline/`）：

| plan | 基线 | 终验 | 判定 |
|---|---|---|---|
| release-smoke | 15/16 | **16/17** | 老 16 题仍 15，新增「保鲜膜推断落点」过 |
| daily-use | 32/35 | **34/35** | +2 |
| day-flow | 2/3 | **3/4** | 老 3 题仍 2，新增「多轮短号引用」过 |

- 测试家庭：`eval-curriculum`（family `ff9b0c52-2513-4e45-84f3-537dcfbf18fc`）
- 接口：`http://localhost:8080/api/ai/act`，`AI_ACT_RATE_PER_MINUTE=200`，未撞 429
- 单测：178 passed / 0 failed
- prompt 字数：3531 → 2821（-20.1%），版本 71 → 76
- 能力表：seed 46 → 48（写接口补 `_src` 与 `itemId`）

## 始终未过的三题（与本批改动无关）

| plan | 题 | 现象 |
|---|---|---|
| release-smoke | `scene-want-coffee` | 未查库直接说「台账里没查到咖啡」 |
| daily-use | `user-use-milk-drank` | 该澄清时没澄清 |
| day-flow | `user-day-home` | 一天多轮里本轮未落写调用 |

## 审计观测

- 写调用 `_src` 申报：全部为 `from=user`，`inference` / `probe` 占比 0
- 核验驳回：`PLACE_UNGROUNDED`、`INFERENCE_NO_BASIS` 各出现 1 次
- `REF_UNKNOWN`：0 次误报
