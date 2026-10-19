## 1. 模型目录：视觉预设

- [x] 1.1 `ModelCatalog` 增 `vision` 标记；首批加通义 / 智谱视觉模型各一个（选型见 design Open Questions，实现前实测可通）
- [x] 1.2 `resolve` / `callModel` 行为不变：未知 provider/model 仍拒绝；`completionsUrl` / `jsonObjectFor` 不回归
- [x] 1.3 `clientPresets()` 透出 `vision`；`listKeys` 增「是否有可用视觉能力」布尔（家庭视觉 key 或 hosted 池视觉 key 均算可用）
- [x] 1.4 单测：vision 解析；未知视觉 model 拒绝；旧文本模型行为不变

## 2. 多模态调用

- [x] 2.1 构造「system + user(text + image_url parts)」messages 复用 `DeepSeekClient.complete()`（已接受 `ArrayNode messages`，签名零改）；仅当实测某模型必须 `json_object` 才稳定时再加最小变体
- [x] 2.2 错误分类沿用 `classifyError`；429/5xx 的可重试语义与 `deepseek-chat` 一致
- [x] 2.3 单测：请求体结构（parts 顺序、data URL 前缀、role）用轻量 stub server 或构造器级断言覆盖

## 3. `ai.capture` 服务

- [x] 3.1 `AiCaptureService`：密钥选择 = `ActKeyResolver` 结果按 vision 过滤排序（家庭优先、hosted 兜底、冷却生效）；无视觉 key → `AI_NO_VISION_KEY`
- [x] 3.2 限流复用 `AiRateLimitService`；身份/家庭校验复用 `RequestContext` + membership（无家庭 → `NO_FAMILY`）
- [x] 3.3 抽取提示词（system）：固定 JSON schema、只抽可见字段、禁编造、日期归一 `YYYY-MM-DD`、无「说 xxx 就做 xxx」话术；进 `AssistPromptTexts` 或同级新常量
- [x] 3.4 解析与 repair：非法 JSON → 一次 repair → 再失败温和失败；字段归一化（quantity 非负有限数、日期合法区间、name/unit 限长 trim）；非法丢字段
- [x] 3.5 `AiController` 加 `POST /api/ai/capture`；响应 `{ fields, modelUsed }`；不写台账、不产活动、不进 history
- [x] 3.6 单测：字段解析（合法/围栏/repair/空字段/非法日期数量丢弃）；密钥选择（家庭视觉优先/hosted 兜底/全无报错）；提示词契约断言（schema 键齐、无关键词路由话术）

## 4. 小程序入口

- [x] 4.1 `pages/items/edit`：图片槽位区下加「按图预填」按钮；可见性由 `ai.listKeys` 的视觉能力标志驱动（无则隐藏）。`utils/cloud.js` 无需白名单改动——`callAi` 直连 `javaApi.callModule`，`applyWriteInvalidation` 只匹配 item/space/tag/family，`ai.capture` 不触发缓存失效
- [x] 4.2 取图顺序：优先**最近一次新选/新拍**的本地未上传图（`lastLocalPath` 标记，随选图/删槽更新）；无标记时退回第一张本地图；仅已存图时 `wx.downloadFile` 再转 base64，失败温和降级（`cloudImage.localImageDataUrl` / `storedImageDataUrl`）。多图场景必须「上传哪张识别哪张」，禁止固定取第一张槽位
- [x] 4.3 回填由**模型定夺**：当前表单快照随图发给 `ai.capture`（`context`，服务端按 parseFields 同规则归一化），模型对比照片与表单输出每个字段最终值；多图场景可修正旧值（如背面图补规格/日期）。**用户手改过的字段不覆盖**（`touched` 标记，含手动清空）；空返回值不清除原值；toast「已更新 N 项」。失败/429/超时/全空识别 → toast 具体中文提示，表单不动。预填用**独立局部 loading 位**（`capturing`），禁止复用编辑页 `loading`/`saving`（挡住 bootstrap/保存即为缺陷）；所有异常 try/catch 收口
- [x] 4.4 保存路径零改动：仍 `item.create/update`，`source: 'ui'`；封面图链路（compress/upload/MAX_ITEM_IMAGES=3）不变
- [x] 4.5 `packageAi/keys`：视觉模型徽标（label 由服务端目录自带「（可看图）」）+ 视觉能力说明一行；`utils/copy.js` 补全部文案；`callAi` capture 超时 30s

## 5. 场景回归清单（2026-10-19 已执行；服务端全链路 + ai.act 真模型联调）

> 执行方式：本地 Docker 栈（hs-api 8080）真实 HTTP 回归 + hosted 池 MiMo 视觉模型真调用；
> 单测取本次构建 surefire 报告。执行后已还原家庭台账/密钥/订阅状态。
> 遗留：① 运行镜像构建于 08:43，早于 `AiCaptureService.java` 09:26 的最后保存，capture 结果需在重建后复核；
> ② `AiCaptureKeySelectTest.familyVisionKeyIsKeptFirst` 失败（与 `atMostTwoKeysTried` 契约互相矛盾，见回归报告）；
> ③ 小程序 UI 真机流程未跑（无 devtools 自动化），客户端逻辑经代码审查。

- [x] 5.1 主流程：`ai.capture`（牛奶标签图）6 字段全对 → `item.create`（source=ui）→ `item.get`/活动消息/`item.count` 正确；UI 真机未跑
- [x] 5.2 编辑模式：服务端 context 合并验证（照片值修正表单旧值、空表单=纯抽取）；客户端 touched 不清除/不覆盖逻辑代码审查通过；真机未跑
- [x] 5.3 无视觉家庭：禁用 hosted 视觉密钥后 `visionAvailable=false`（按钮隐藏依据）+ capture 返回 `NO_VISION_KEY` 指定话术；纯手工录入路径未受影响
- [x] 5.4 hosted 池家庭：按钮可见可用，capture 走 hosted mimo-v2.6-flash；家庭模式（setDefaultKey）下家庭视觉密钥优先、无效密钥报「密钥无效，请到 AI 配置页检查」，setHostedDefault 后恢复 hosted
- [x] 5.5 失败路径：非物资图→fields{}（表单不动）、无效家庭密钥→温和中文话术、非法 image 入参→BAD_REQUEST；模型超时/429/repair 失败未实测（classifyError 有单测覆盖）
- [x] 5.6 助手回归：`ai.act` 真模型联调——查询（item.search+表格）、两轮澄清后直接执行 item.create（source=agent）、page.get 自纠正（ledger→items.list）、history 传递均正常
- [x] 5.7 key 页回归：addKey（视觉预设）/listKeys（掩码+visionAvailable）/setDefaultKey/setHostedDefault/removeKey 全通过；预设视觉徽标（「（可看图）」+vision 标记）在 listKeys 透出
- [x] 5.8 周边回归：item create/remove、count（4→3→2）、listExpiring、activities 快照均正常；itemExpireSubs/多家庭切换未触碰
- [x] 5.9 `ai-eval`：12 个 plan mock 模式全跑，582 用例 0 error（结构无回归；capture 题库后置）

## 6. 收尾

- [x] 6.1 AGENTS.md AI 相关 bullet 补一行（编辑页按图预填 = `ai.capture`，视觉预设在 ModelCatalog）
- [ ] 6.2 归档 change（openspec 工作流），把 5 的验收结果记入 proposal 或 tasks
