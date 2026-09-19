# assist-act-v2 提示词

运行时正文在 `miniprogram/cloudfunctions/ai/promptAssist.js`（`ASSIST_PROMPT_V2`），由云函数 `ai.act` 按 `version` 写入 `aiPrompts.assist-act-v2`。

**不要改** `item-extract-v1`。

占位符：`{{TODAY}}` `{{WEEKDAY}}` `{{FAMILY_NAME}}` `{{CAPABILITIES}}` `{{TREE}}` `{{HISTORY}}` `{{FOCUS}}` `{{PROBE}}` `{{EXEC}}`。

当前版本 **v26**。提示词含「系统是什么」与禁止臆造库存。**v24**：开放空间创建与批量结构。**v25**：创建类失败回灌 `{{EXEC}}`，最多一轮模型重编排；代码只执行与回报成败，不做降级/改挂等决策。**v26**：写死挂载规则——位置必须在空间下；物资必挂空间、位置可空；位置失败→挂空间；空间失败→挂默认仓库（树「（默认）」）。

模型输出 JSON：`ask` / `probe` / `calls` / `reply`。

- **查库存** → 必须 `probe` 或 `item.search`；TREE 不含物资。品类问可全家 list 后再 reply。
- **写台账** → `calls`；查询结果由执行器按台账字段回报。
- **闲聊/问结构** → 模型依据 TREE 用 `reply` 作答（点名空间只答该处）；执行器不再用正则短路或整树倾倒。
- **临期消息订阅** → `calls: [{"use":"item.expireSubscribePanel"}]`（微信须用户手势授权，不能代开）。
- **能力不够** → 固定能力有限话术。

控制流重构见 `openspec/changes/ai-assist-agent-runtime/`。
