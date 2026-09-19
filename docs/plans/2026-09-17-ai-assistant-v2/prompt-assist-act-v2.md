# assist-act-v2 提示词

运行时正文在 `miniprogram/cloudfunctions/ai/promptAssist.js`（`ASSIST_PROMPT_V2`），由云函数 `ai.act` 按 `version` 写入 `aiPrompts.assist-act-v2`。

**不要改** `item-extract-v1`。

占位符：`{{TODAY}}` `{{WEEKDAY}}` `{{FAMILY_NAME}}` `{{CAPABILITIES}}` `{{TREE}}` `{{HISTORY}}` `{{FOCUS}}` `{{PROBE}}`。

当前版本 **v18**。提示词开头有「系统是什么」：家庭共享物资台账、真实能力/做不到的事、数据从哪来。并强调禁止臆造库存与写入结果。v15 补充：澄清芯片/「（澄清：…）」必须接上句写台账意图，禁止把地点名当成查库存。v16 增加「产品本体与名词」。v17：品类/全家问 → `probe {"list":true}` 后再用常识归纳。**v18（agent-runtime）**：明确模型是唯一意图路由器（服务端无关键词预路由）；结构问答只依据 TREE 用 reply；临期订阅走 `item.expireSubscribePanel`（不能代开，可打开面板让家人自己点）。

模型输出 JSON：`ask` / `probe` / `calls` / `reply`。

- **查库存** → 必须 `probe` 或 `item.search`；TREE 不含物资。品类问可全家 list 后再 reply。
- **写台账** → `calls`；查询结果由执行器按台账字段回报。
- **闲聊/问结构** → 模型依据 TREE 用 `reply` 作答（点名空间只答该处）；执行器不再用正则短路或整树倾倒。
- **临期消息订阅** → `calls: [{"use":"item.expireSubscribePanel"}]`（微信须用户手势授权，不能代开）。
- **能力不够** → 固定能力有限话术。

控制流重构见 `openspec/changes/ai-assist-agent-runtime/`。
