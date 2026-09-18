# assist-act-v2 提示词

运行时正文在 `miniprogram/cloudfunctions/ai/promptAssist.js`（`ASSIST_PROMPT_V2`），由云函数 `ai.act` 按 `version` 写入 `aiPrompts.assist-act-v2`。

**不要改** `item-extract-v1`。

占位符：`{{TODAY}}` `{{WEEKDAY}}` `{{FAMILY_NAME}}` `{{CAPABILITIES}}` `{{TREE}}` `{{HISTORY}}` `{{FOCUS}}` `{{PROBE}}`。

当前版本 **v17**。提示词开头有「系统是什么」：家庭共享物资台账、真实能力/做不到的事、数据从哪来。并强调禁止臆造库存与写入结果。v15 补充：澄清芯片/「（澄清：…）」必须接上句写台账意图，禁止把地点名当成查库存。v16 增加「产品本体与名词」：空间/地点/物资/标签/临期的产品义，以及房间→空间、东西→物资等生活说法对照；结构问句对齐概念后再答，称呼不清则 ask。v17：品类/全家问（如「有什么吃的」）→ `probe {"list":true}` 后再用常识归纳；执行器不再把这类问法逼成「选空间」。

模型输出 JSON：`ask` / `probe` / `calls` / `reply`。

- **查库存** → 必须 `probe` 或 `item.search`；TREE 不含物资。品类问可全家 list 后再 reply。
- **写台账** → `calls`；查询结果由执行器按台账字段回报。
- **闲聊/问结构** → 模型依据 TREE 用 `reply` 作答（点名空间只答该处）。执行器只做两件事：别把结构问句强制改成查物资；模型误 probe/查库时按问句收窄兜底，不抢答、不整树倾倒。
- **临期消息订阅** → 执行器短路返回物资列表 + 开关面板（微信须用户手势授权，不能代开）。
- **能力不够** → 固定能力有限话术。
