# 管家能力评测题库（ai-eval）

与「家庭习惯」**无关**。题库只测一件事：家人日常怎么跟管家说话，管家办得对不对。  
每题 = **对话** + **人能看懂的结果预期**；最终用 `ai.act` 实跑验收。

题库只读。每次开跑誊抄到 `runs/`。

## 怎么出题（用户视角）

- 用家人原话：短、碎、带指代，不写「请调用 item.update」
- `expected.outcome` 写**家里人感知到的结果**（账上变了啥、有没有先问清楚），少写实现黑话
- 多轮把前面当 history，最后一句交给本轮 `ai.act`

## 目录

| 路径 | 内容 |
|------|------|
| `bank/user` | 平常怎么用：拆袋、做饭问、过期、用掉、理一理、家人、路过超市、反悔、一天多轮 |
| `bank/product` | 口语问法补缺 + 我会踩的坑 |
| `bank/eng` | 红线（仍用白话 prompt） |
| `fixtures/home-daily.json` | 共享假家里库存 |
| `fixtures/home-wide.json` | 更密的一套：含苹果/电脑、大米/米，给 `scenes-wide` 用 |
| `fixtures/home-unit-clash.json` | 厨房有按斤记的苹果（1 斤无位置 + 5 斤在冰箱），给 C9/C10 用 |
| `plans/` | 开跑计划 |
| `runner.mjs` | 誊抄 / mock 结构检查 / `--mode act` 打真接口 |

## 开跑

```bash
node ai-eval/runner.mjs --plan core-smoke
node ai-eval/runner.mjs --plan daily-use
node ai-eval/runner.mjs --plan pitfalls
node ai-eval/runner.mjs --plan day-flow
node ai-eval/runner.mjs --plan all-butler
node ai-eval/runner.mjs --plan curriculum-core
node ai-eval/runner.mjs --plan coverage-act
node ai-eval/runner.mjs --plan scenes-wide
node ai-eval/runner.mjs --plan scenes-life
node ai-eval/runner.mjs --plan scenes-chat
node ai-eval/runner.mjs --plan scenes-more

# 真打管家（会按 case.setup.fixture 灌库存；确认闸/澄清芯片由 runner 代点）
HS_TOKEN=xxx node ai-eval/runner.mjs --plan core-smoke --mode act
HS_TOKEN=xxx AI_ACT_RATE_PER_MINUTE=200 node ai-eval/runner.mjs --plan daily-use --mode act
```

`mock`：无 `mockPlan` 时标 `pending`（等实跑）。`act`：请求 `/api/ai/act` 后按约束判定；每题开跑前按 `setup.fixture` 铺库存，并删掉这份清单里没有的物资，避免前一题删改带到后一题。本地建议把 `AI_ACT_RATE_PER_MINUTE` 调高。`expected.callIncludes` / `callExcludes` 核对改到哪一件、数量是多少。
