## Context

素养课表把「记住这家习惯」「自动评测」划在范围外。现要落地有上限的习惯配额，并建立独立题库（题库只读、答卷誊抄）。

## Goals / Non-Goals

**Goals**

- 全局 5 条规范 + 每家最多 7 条偏好（建议至少能存 5）
- 习惯注入 act system，模型自行编排；不改写计划
- `ai-eval/` 题库 + plans + runs；runner 先 mock 判定

**Non-Goals**

- 向量长记忆、无限标签偏好
- 习惯表做 NL 关键词路由
- 真 LLM CI 满分评测（后置）
- 小程序习惯设置 UI（可后置；tool 可写）

## Decisions

### D1 配额

| 层 | 额度 | 载体 |
|----|------|------|
| 全局 | 5 | prompt 固定段（bump `ASSIST_PROMPT_VERSION`） |
| 这家 | 最多 7（槽位类型 7 种，每种至多 1 条） | `family_ai_habits.habits_json` |

超限：`habit.upsert` 拒绝并说明须先 `habit.remove`。

### D2 全局 5（锁定文案）

1. 短答应接往来 history，不靠口诀猜意图  
2. 短号或对象不明时 ask 或 probe，不默默写库  
3. 回执说人话：改了什么、改成多少  
4. 能力外拒执行；能指路则用 page.get  
5. 闲聊接一两句后引回台账；报库存须先查库  

### D3 这家槽位类型（锁定）

| slot | 含义 |
|------|------|
| `default_space` | 没说地点时的默认落点空间名 |
| `naming` | 命名习惯 |
| `unit` | 品类默认单位 |
| `summarize` | 归纳维度（空间/标签/临期） |
| `duplicate_name` | 同名撞库时的问法倾向（仍须 ask） |
| `tone` | 语气长短 |
| `focus` | 常关注点 |

每条存 `{ "slot", "text" }`，`text` ≤ 80 字。

### D4 红线

习惯是事实，只进 `{{HABITS}}`；禁止代码按习惯 slot 拼 calls / 改写计划。

### D5 题库

根目录 `ai-eval/`：`bank/{product,eng,user}`、`plans/`、`runs/`、`schemas/`、`runner.mjs`。  
开跑：选 plan → 新建 `runs/<ts>-<plan>/` 誊抄题目 → 写 results + summary。题库只读。

### D6 Tool

- `habit.list` — 列出本家习惯  
- `habit.upsert` — 按 slot 写入/覆盖  
- `habit.remove` — 按 slot 删除  

## Risks

- [挤占 system] → 全局各一行；这家紧凑列表  
- [习惯变路由] → 迭代指南红线 + eng 向题覆盖  
- [真模型飘] → mock 先行  
