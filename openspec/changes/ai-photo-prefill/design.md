## Context

- 预填要出字段：`name` / `quantity` / `unit` / `productionDate` / `expireDate`（可选 `note`），与 `pages/items/edit.js` 保存入参一致。
- 模型调用必须走服务端：`family_ai_keys` 客户端写 deny；`ActKeyResolver` 按 familyId 解析家庭密钥 + hosted 池，`PlatformKeyFailover` 管冷却与切换。
- 图片已有压缩上传链路：小程序端 `compressImageForUpload`（maxEdge 800 / quality 55，约 100–300KB）→ `POST /api/storage/upload`，返回 `objectKey` 与 `publicUrl`。
- `ai.act` 是 plan/history/确认卡循环，**不适合**塞一次性抽取；V3 的「禁 NL 关键词路由」也与抽取正交（这是结构化抽取，不是意图路由）。
- `ItemService` 的 `expireDate` 是单值单字段；本 change 不改它（多保质期 lot 模型挂起）。

## Goals / Non-Goals

**Goals:**

- 拍/选图后一键拿到字段建议，全部以**表单可编辑值**回填，保存仍走 `item.create/update`（`source: 'ui'`）。
- 复用 BYOK 与 hosted 池，不新增第二套模型通道；无视觉能力的家庭自然降级（入口隐藏）。
- 抽取失败/认不出/部分是**温和失败**：toast + 表单保持原状，绝不阻塞手工录入。

**Non-Goals:**

- 不改 `items` 模型（lot / 多保质期挂起，另开 change）。
- 不做 AI 写入预填（预填不直接落账，人点保存才算）。
- 不做自动多图评测题库（图片二进制不入库；见 Open Questions）。
- 不做 OCR 兜底；不引入直连模型商的客户端通道。

## Decisions

1. **独立端点 `ai.capture`，不并进 `ai.act`。** 一次 system + 一次 user（图 + 抽取指令），`json_object` 响应，走与 `acceptOrRepairPlan` 同思路的「解析失败→一次 repair→再失败即温和失败」。不写 history、不产 block/confirm。
2. **图走 base64，不走公网 URL。** `publicUrl` 在本地 MinIO 靠匿名 GET（`ObjectStorageClient` 生产可达性未保证），不赌；已压缩小图 base64 进 user content parts。调用层**不加新方法**：`DeepSeekClient.complete()` 已接受 `ArrayNode messages`，capture 构造「system + user(text + image_url parts)」直接调它；`response_format` 由 prompt 约束 JSON、解析失败走一次 repair，与 `acceptOrRepairPlan` 同思路。若个别 model 实测必须 `json_object` 才稳定，再加最小变体，默认不加。
3. **密钥选择：家庭视觉 key 优先 → hosted 池视觉 key → 报错。** 在 `ActKeyResolver.select(familyId)` 结果上按「模型可看图」过滤排序——**过滤放在 capture 外层，不改 resolver 本身**；没有视觉 key 时返回 `AI_NO_VISION_KEY`。限流直接调 `AiRateLimitService.checkAct(openid)`（同一 openid 桶：capture 高频可能顶掉同一人的 act 额度，可接受则不加新阈值）。
4. **视觉预设 = 目录白名单，不是能力探测**：判断口径是「密钥绑定的 model id 是否在 `ModelCatalog` 的 vision 清单里」，不做任何出网探测（不花用户 token、不引入失败态）。按厂商官方文档核对后的清单：
   - `mimo` + `mimo-v2.6-flash`（官方模型页输入模态含图像）
   - `deepseek` + `deepseek-flash`（V4.1-Flash-1017，官方定价页 Vision ✓）
   - `kimi` + `kimi-k3`、`kimi-k2.6`（官方快速开始：K3/K2.7/K2.6 均支持文本、图片与视频输入）
   - `zhipu` + `glm-5.3-flash`（原生多模态；`glm-5.3` 为纯文本）、`glm-4v-plus`（旧版）
   - `qwen` + `qwen3.7-plus`、`qwen3.8-max`（官方模型列表：同属文本生成与图像理解）、`qwen-vl-plus`（旧版）
   `ModelChoice` 增 `vision` 布尔；`clientPresets()` 透出，密钥页加「可看图」徽标。厂商出新型号需手动加目录（白名单的代价）。
5. **回填由模型定夺**（原「只填空字段」的升级版，Open Question 1 已拍板）：当前表单快照随图发给 `ai.capture`（`context`，服务端按 parseFields 同规则归一化，空值/非法值不带入），prompt 增加裁决规则——照片有明确值以照片为准（可修正旧值）、照片没显示原样保留表单值、冲突时以更完整的照片信息为准。客户端保留最后防线：**用户手改过的字段（含手动清空）不被模型覆盖**；模型返回空不清除原值。多图录入（正面→背面）时后一张图可补全/修正前一张的字段。
6. **服务端强校验**：`quantity` 必须有限非负数字；日期必须 `YYYY-MM-DD` 且落在 1900-01-01..+10 年；非法丢该字段。`name` 限长并 trim；`unit` 限长。
7. **提示词契约**：固定 JSON schema；只抽图上看得见的字段，没有就空；**禁止编造**；日期统一 `YYYY-MM-DD`；不写「说 xxx 就做 xxx」式话术（本就不是对话）。
8. **页面故障隔离硬规则**：预填用**自己的局部 loading 标志**，禁止复用编辑页的 `loading` / `saving` 数据位（bootstrap 与保存闸门共用它们，预填卡住绝不能挡住保存）；预填只 `setData` 改表单字段，异常一律 try/catch 收口成 toast。

## Risks / Trade-offs

- 视觉模型 id 会过期：与文本模型同命运，目录改一版即可；失效时 `ai.capture` 温和失败，不影响手工录入。
- 视觉 key 的 token 成本高于文本：单次一张小图可接受；用限流与「仅按需触发一次」控量。
- 家庭默认 key 是 DeepSeek 等纯文本时入口隐藏，用户可能不知道有此能力：密钥页徽标 + 预填按钮隐藏即无声降级；后续可在 key 页文案说明。
- **共享降级耦合（已知且方向正确）**：hosted 视觉 key 被 capture 打挂会进 60s 冷却（`PlatformKeyFailover.COOLDOWN_MS`），期间 act 的 hosted 池也跳过这把——同一把 key 的健康信号共享，key 真病了 act 本该避开，保留不拆。
- **限流桶共享**：capture 与 act 同 openid 桶（`checkAct`）；capture 高频会顶掉同一人的 act 额度。降级方向正确（限模型调用总量），但需在回归清单验证 toast 可读。
- 用户可把视觉模型选为默认 act key：qwen-vl / glm-4v 等本身是 chat 模型，纯文本请求可用，不破 `ai.act`，但成本/风格差异要靠 key 页徽标提示。
- 小程序读已存封面图转 base64 依赖 downloadFile 合法域名：编辑态对**已有物资**预填时，优先取本地未上传的图；若只有已存 URL，`wx.downloadFile` 需在合法域名内，失败同样温和降级。
- 与 `multi-provider-ai-keys` 的目录共用：新增视觉条目不影响既有平台调用路径，但 presets 变多，密钥页 UI 要分组/标注清晰。

## Migration Plan

无数据迁移。`ModelCatalog` 为代码目录，`family_ai_keys` 行不变。回滚 = 撤 `ai.capture` 端点与编辑页按钮，`ModelCatalog` 视觉条目可留（不被调用无副作用）。

## Open Questions

1. ~~回填策略：只填空 vs 全量覆盖~~ **已拍板：模型定夺**（见 Decisions 5）——表单快照进 prompt 由模型裁决，客户端只保护用户手改字段。
2. 首批视觉模型选型：`qwen-vl-plus` / `glm-4v-plus` / 其他，需要一个自有 key 实测通过再定稿目录。
3. 识别出的「保质期至 2026-12-01」是否顺带写 `note`：建议不写，note 保持纯手工；如要「依据备查」，放后续。
4. 自动评测：是否给 `ai-eval` 加 `bank/capture/`（少量图片 fixture + expected fields）。图片入库有顾虑，倾向先人工验收，后置自动化。
