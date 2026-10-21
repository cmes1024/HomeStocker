# 管家能力评测报告

> 把「AI 能力」当代码测：**513 个口语化用例、12 个 plan、双向断言回归**。
> 本报告记录实测数据、模型对比与已知边界，用于换模型 / 改提示词前后的效果验证。

- 题库说明与出题规范：[`README.md`](README.md)
- 行为规格（能力契约）：[`../openspec/specs/`](../openspec/specs/)

---

## 1. 结论速览

| 项 | 数值 |
|---|---|
| 题库规模 | **513 个用例** / 12 个 plan |
| `step-3.5-flash` 全量实测 | **82.8%**（425 过 / 88 败） |
| `mimo-v2.6-flash` | **修复 88 个失败中的 64 个（72.7%）**；全量未复跑，**推算约 95.3%**（非实测） |
| 剩余失败 | 24 个，集中在 4 类（见第 4 节） |
| 评测方式 | `ai.act` 实跑 + fixture 铺库 + 确认闸 / 澄清芯片由 runner 代点 |

> **口径说明**：82.8% 为全量实测；mimo 的 95.3% 由「失败集修复率」推算得出，**未做全量复跑**，引用时请注明。

---

## 2. 怎么测的

### 2.1 用例长什么样

每条用例 = **家人原话** + **人能看懂的结果预期**，不写实现黑话：

```json
{
  "id": "chat-eat-expiring",
  "prompt": "晚饭就吃快过期的那个，吃完帮我减一盒",
  "expected": {
    "outcome": "先分清哪盒快过期。酸奶明天到期，喝掉一盒后剩 1 盒",
    "requiredTools": ["item.update"],
    "forbiddenTools": ["item.remove", "item.removeMany"],
    "callIncludes": [{ "use": "item.update", "name": "酸奶", "quantity": 1 }]
  }
}
```

注意 `requiredTools` 与 `forbiddenTools` **同时存在**——「减一盒」必须走 `item.update`，**不允许**走删除。同一件事的正反两面都被钉住。

### 2.2 判定断言

| 断言 | 含义 |
|---|---|
| `requiredTools` / `requiredToolsAny` | 必须调（任一）这些工具 |
| `forbiddenTools` | 不允许调这些工具 |
| `callIncludes` / `callExcludes` | 调用参数必须（不）包含某字段值，如「酸奶改成 1」 |
| `mustProbe` | 必须先查库再答，不允许凭空编 |
| `mustAsk` | 信息不足必须先问，不允许擅自改账 |

### 2.3 复现方式

```bash
# 结构自检（不花钱，不调模型）
node ai-eval/runner.mjs --plan core-smoke

# 实跑单个 plan（需要 HS_TOKEN，按 fixture 铺库存）
HS_TOKEN=xxx HS_API_BASE=http://127.0.0.1:8080 \
  node ai-eval/runner.mjs --plan core-smoke --mode act

# 只重跑指定用例（换模型后验证失败集最省时间）
HS_TOKEN=xxx HS_API_BASE=http://127.0.0.1:8080 \
  node ai-eval/runner.mjs --cases id1,id2,id3 --mode act
```

---

## 3. 模型对比

### 3.1 实测数据（2026-10-21）

| plan | 用例数 | step-3.5-flash |
|---|---|---|
| core-smoke | 9 | 8 过 1 败 |
| daily-use | 35 | 30 过 5 败 |
| coverage-act | 14 | 12 过 2 败 |
| pitfalls | 8 | 7 过 1 败 |
| curriculum-core | 8 | 7 过 1 败 |
| ask-gaps | 6 | 4 过 2 败 |
| day-flow | 3 | 2 过 1 败 |
| scenes-life | 28 | 24 过 4 败 |
| scenes-wide | 46 | 39 过 7 败 |
| scenes-chat | 46 | 35 过 11 败 |
| all-butler | 54 | 46 过 8 败 |
| scenes-more | 325 | 268 过 57 败 |
| **合计（去重 513 用例）** | | **425 过 / 88 败 = 82.8%** |

### 3.2 失败集重跑（同日，`mimo-v2.6-flash`，走平台托管密钥池）

| | 数量 |
|---|---|
| 重跑原失败用例 | 88 |
| 转为通过 | **64（72.7%）** |
| 仍失败 | 24 |

推算全量：`(425 + 64) / 513 ≈ 95.3%`（**推算值，未实测**）。

### 3.3 失败类型分布

| 断言类型 | step 全量失败 | mimo 重跑后仍失败 |
|---|---|---|
| `requiredTool` 缺失 | 75 | 20 |
| `callIncludes` 参数不符 | 11 | 8 |
| `requiredToolsAny` | 8 | 0 |
| `mustProbe` 未探库 | 3 | 1 |
| `mustAsk` 未澄清 | 2 | 1 |
| `forbiddenTool` 误调 | 2 | 2 |

step 的 88 个失败里，**77 个是「一个工具都没调」**——典型的多步「先查后改」链断裂：模型查完了，但没接着写。

---

## 4. 已知边界（24 个仍失败用例）

按根因归类，**这是当前版本的已知退化点，不是偶发 bug**：

| 类别 | 数量 | 用例 |
|---|---|---|
| **「用完 = 删」未守住**（反而改数量，或没删） | 5 | `chat-ate-two-apples`、`chat-toilet-gone`、`scene-apple-then-computer`、`scene-rice-then-grain`、`scene-toilet-gone` |
| **撤销类无动作** | 2 | `curriculum-c1-undo`、`user-undo-revoke` |
| **查询类未调工具**（直接凭记忆答） | 11 | `life-fever`、`scene-read-ibuprofen`、`chat-fridge-milk`、`more-004`、`more-014`、`more-081`、`more-084`、`more-088`、`more-137`、`more-172`、`more-282` |
| **数量精度差一** | 2 | `chat-eat-expiring`（酸奶→1）、`more-186`（大米→1） |
| 其它（该问没问 / 误批量删） | 4 | `scene-apple-to-study`、`user-shop-milk`、`user-day-home`、`more-304` |

### 4.1 最值得关注的一条

「用完 = 删」是**产品层刻意定的软规范**（数量为 0 会留下僵尸记录：占位、盘点显示有这项、搜得到、临期提醒仍会计算）。它由模型判断自然语言实现，**不写关键词表**。

两个模型都没完全守住它：step 全错，mimo 修好大部分但剩 5 个。结论：

> **软规范交给模型是对的，但必须靠评测持续看守**——否则换模型、换版本，退化是静默发生的。

---

## 5. 使用约定

1. **换模型必跑**：至少跑失败集（`--cases`），再决定是否全量。
2. **改提示词 / 改能力目录必跑**：防「修一个坏一个」。
3. **通过率不是目标，失败清单才是**：新增用例优先补「已知边界」表里的类别。
4. **引用数据必须带条件**：模型、日期、是否全量。推算值要标注。

---

## 6. 待改进

| 项 | 说明 |
|---|---|
| **运行未记录模型** | `runs/*/results/*.json` 里没有 model 字段，导致 2026-10-16 一批 99.8% 的运行无法归因到具体模型。建议 runner 落盘时记录 provider / model / baseUrl |
| `quantity = 0` 无服务端硬校验 | 能力契约写了「须大于 0」，但服务端只拦负数；0 目前靠模型自觉 + 评测兜底 |

---

*数据产生于 2026-10-21，运行产物见 [`runs/`](runs/)。*
