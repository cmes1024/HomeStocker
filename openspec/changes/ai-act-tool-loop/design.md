## Context

`ai.act` 让模型一次交出 `{reply, ask, probe, calls, present}`，不够时由 `AiActService` 把中文禁令贴回用户句再问。提示词版本已到 53。`ai-eval` 已有题库和 `--mode act`，但没有课表核心轨这一组固定计划。

写路径、确认闸、`quantity > 0`、`HARD_DENY` 保持不动。禁止按用户句子选接口。

## Goals / Non-Goals

**Goals:**

- 课表 C1–C8 可按计划开跑，断言工具与禁止写入
- 首轮提示词里已有「本句点到的物资行」
- 为工具循环留出替换 JSON 计划的合同，客户端协议不变

**Non-Goals:**

- 不做模型微调
- 不改小程序气泡、确认卡协议
- 不把习惯、知识包、页面目录重写成新领域模型
- 本阶段不把召回做成向量检索

## Decisions

1. **评测沿用 `ai-eval`。** 新增 `plans/curriculum-core.json` 和 `bank/product/curriculum-c*.json`。不断言回复原文。mock 无 token 时保持 pending。
2. **召回只做名称重合。** 从本家 `items.name` 取目录，长名优先、占住已匹配区间，最多 8 个名称、12 行。短号用 `P*`，随后的 probe 从已用编号之后继续，避免覆盖。单字符 ASCII 名称跳过。
3. **召回写在 system 的 `{{RECALL}}`。** 事实在问模型之前就在。提示词只说明这些行是事实、不是已经决定要改的对象。版本 bump，由 `ensurePrompt` 覆盖。
4. **工具循环后做。** 原生 `tools` 替换六通道 JSON；读工具立即回填，须确认的写工具停住出确认卡，步数上限 4。确认重放路径保持 `confirmed + calls`。

## Risks / Trade-offs

- 名称是子串：`米` 会命中 `厘米`，除非更长的物资名已经占住那段。用长名优先降低误伤，不按词表猜意图。
- 召回之后模型可能不再调用 `item.search`。核心轨用例不把「必须出现 probe」当成通过条件，改看写入或提问。
- 工具循环未落地前，提示词仍会偶发需要改语气；台账事实类问题应先看召回是否命中。

## Migration Plan

1. 上线评测计划（不改运行时）
2. 上线召回与提示词版本；旧 system 在下次 `ensurePrompt` 时被更高版本替换
3. 再替换模型输出协议为工具循环；`ai.act` 对外状态机不变

回滚：把提示词版本调回上一份 system，并去掉召回注入。评测计划可留。

## Open Questions

- 工具循环与现有「只读查询后再问一轮」的 follow-up 如何合并，实现时以步数上限内的同轮工具结果为准，不再贴系统禁令。
