# AI 管家决策权改版 — 实施向导

> **OpenSpec：** [`openspec/changes/ai-decision-authority/`](../../../openspec/changes/ai-decision-authority/)（proposal / design / tasks / specs）
> **事实来源：** [`../2026-10-24-ai-decision-authority-map.md`](../2026-10-24-ai-decision-authority-map.md)（302 个介入点盘点）
> **本次范围：** 不做 LangGraph、不改确认闸门存在性、不改物资字段与容量档。

## 一句话

服务端从「语义裁判」退为「事实审计 + 执行 + 不可逆闸门」；服务端与模型之间用**结构化回执**通信；引用有确定生命周期。分 6 批，每批独立验收、独立回滚。

---

## 0. 开工前的硬约束

| 约束 | 说明 |
|---|---|
| **禁止在真实家庭上跑 eval** | `runner.mjs --mode act` 会按 `setup.fixture` 铺库存，并**删掉清单里没有的物资**。只在专用测试家庭跑（如 `local-dev-openid` / `eval-curriculum`）。 |
| **没有基线不动手** | B0 没产出三份 run 的通过率之前，不做任何行为改动。否则无法判断好坏。 |
| **一批一合并** | 不设大爆炸。每批跑完三份 plan 再进下一批。 |
| **不改 `expected` 换通过率** | 放宽断言必须在 `tasks.md` 登记理由，并对应到 spec 的 requirement 变更。 |

## 1. 环境

```bash
docker compose up -d                     # hs-api / hs-postgres / hs-redis
curl -s http://localhost:8080/api/health # {"ok":true,...}

# 令牌：从 Redis 取测试 openid 的会话
docker exec hs-redis sh -c 'for k in $(redis-cli --scan --pattern "hs:sess:*"); do v=$(redis-cli get "$k"); echo "$v" | grep -q <测试openid> && echo "$k"; done'
```

跑真接口时把限流调高，否则大批题会撞 429：

```bash
HS_TOKEN=<token> AI_ACT_RATE_PER_MINUTE=200 node ai-eval/runner.mjs --plan release-smoke --mode act
```

## 2. 批次与门禁

| 批 | 主题 | 通过线 | 依赖 |
|---|---|---|---|
| **B0** | 清死代码 + 记基线 | 编译/单测过；三份 run 落盘 | — |
| **B1** | 结构化错误回执 | `release-smoke` 100%；其余 ≥ 基线 | B0 |
| **B2** | provenance，Grounding 转审计 | `release-smoke` 100%；保鲜膜题一轮过 | B1 |
| **B3** | `itemId` 一等 + 短号重发 | `day-flow` ≥ 基线；多轮短号题过 | B2 |
| **B4** | 解除 `asked → 全扣` | `release-smoke` 100%；先问后写一轮完成 | B3 |
| **B5** | 客户端不伪造发言、不丢正文 | 确认/取消/冷启动三条路径真机过 | 可并行 |
| **B6** | prompt 瘦身 | 字数降 ≥ 20% 且三份 plan 不降 | B4、B5 |

B2 必须晚于 B1（没错误码，模型无法按码修正）；B4 必须晚于 B3（先修引用再松行动权）。

## 3. 基线怎么记

```bash
node ai-eval/runner.mjs --plan release-smoke --mode act   # 生成 ai-eval/runs/<ts>-release-smoke/
node ai-eval/runner.mjs --plan daily-use  --mode act
node ai-eval/runner.mjs --plan day-flow   --mode act
```

把三份结果的通过数写进该 run 目录的 `summary.md` 顶部：

```
基线（2026-10-XX）：release-smoke 16/16 · daily-use a/b · day-flow c/d
```

**三份 run 目录必须提交进仓库**——它是后续所有批次的比较基准。

## 4. 新增回归题（B0 建骨架，B2/B3 启用）

| 题 | 复现的原始症状 | 断言 |
|---|---|---|
| 推断落点 | 保鲜膜「跟原来那卷放一起」被反问 | 一轮内 `item.update` 成功，无 `ask` |
| 同名指明 | 两条酱油删错风险 | `callIncludes` 命中正确 itemId；未指明时返回 `REF_AMBIGUOUS` |
| 多轮短号 | 跨轮引用 `P3` 失效 | 第三轮仍能改到第一轮那件 |

题目写在 `ai-eval/bank/eng/`，`expected` 用 `callIncludes` / `callExcludes` 表达，避免写实现黑话。

## 5. 回滚

- 粒度 = 批次。每批一个 merge，回滚即 revert 该 merge。
- `_src` 只存在于请求与回执，**不落库**；回滚不需要数据迁移。
- 能力表 seed 升版本时可前滚，也可把 seed 版本回退（`AiSeedService` 会按版本覆盖）。

## 6. 常见坑

| 坑 | 处理 |
|---|---|
| 跑 eval 撞 429 | 设 `AI_ACT_RATE_PER_MINUTE=200` |
| 在真实家庭跑 eval → 物资被删 | 只用专用测试家庭 |
| 旧客户端不带 `_src` | 兼容模式只审计不拦；看 `audit.noSource` 覆盖率再收紧 |
| 改完 `release-smoke` 掉题 | 先查是不是 B2 把某个「字面否决」删早了，对照 302 表确认该条归属 |
| `ActToolLoop` 并发修改 | 该文件是热点，B1–B4 都碰；同一时间只在一批里改 |

## 7. 下一个窗口从哪开始

1. 读 `openspec/changes/ai-decision-authority/design.md` 的 D1–D9。
2. 只做 `tasks.md` 的 **B0**，做完停下回报数字。
3. 数字出来后再决定是否进 B1。

**不要**在 B0 未完成时动 `PlaceGrounding` / `WriteGrounding`——没有基线的改动无法验收。
