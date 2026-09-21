# 部署与回归验收清单

对照 `docs/plans/2026-09-17-phase1-status.md`。口袋页无入口，不列入主路径。旧拍照录入 V1 已退役，勿再按 `docs/plans/2026-09-16-package-ai-capture/验收.md` 勾选。

部署前：按 `collections.md`「换环境部署：集合与索引」建齐集合/索引、粘贴安全规则、上传云函数 `family` / `item` / `space` / `tag` / `activity` / `expireNotify` / `ai`（云端安装依赖）。  
AI 另需：`collections.md`「AI 密钥与助手（控制台检查项）」——函数超时 60s、允许出网。真机推送：上传云函数后，在小程序家庭页点「立即检查提醒」（勿用控制台测试云调用）。

## 闭环（原 MVP）

- [ ] 账号 A 创建家庭，获得 6 位邀请码
- [ ] 账号 B 用邀请码加入同一家庭
- [ ] A/B 均可对同一批物资增删改查（名称、数量、备注）
- [ ] 未加入家庭的账号看不到该家庭物资

## 空间 / 位置

- [ ] 首次添加物资无需先建空间，自动落在「仓库」
- [ ] 可创建自定义空间；编辑物资时可改所属空间与具体位置
- [ ] 新建位置：编辑页「新建位置」后可选
- [ ] 家庭页「逛空间」→ 空间列表 → 单空间页看到该空间物资及位置文案
- [ ] 全家物资清单仍可用；可按空间筛选（有空间时）
- [ ] 默认仓库可改名不可删（`DEFAULT_SPACE`）；删除其它空间时物品迁到默认仓库并清空位置；最后一个空间仍拒绝（`LAST_SPACE`）
- [ ] 解散家庭后 `spaces` / `locations` / `tags` / `activities` 一并清理

## A 波：物品详情

- [ ] 清单点击进入详情（`packageBrowse/items/detail`），**不**直接进编辑
- [ ] 清单**无**长按删除
- [ ] 详情展示：名称、数量/单位、空间、位置（可空）、备注（可空）
- [ ] 详情可「改一改」进入现有编辑页；确认删除后走 `item.remove` 并返回清单
- [ ] 空间页内点击物品同样进详情

## A 波：氛围图云存储清理

- [ ] 氛围图换另一张：旧 `cloud://` fileID 被 best-effort 删除；换图成功不被删除失败阻断
- [ ] 氛围从图片改为渐变/纯色：旧图 fileID best-effort 删除
- [ ] Owner 解散带图片背景的家庭：数据清理后 best-effort 删氛围图
- [ ] 普通成员退出：家庭仍在，**不**删氛围图（其他成员继续用）

## A 波：分包与性能

- [ ] 主包页：onboarding / items 清单与编辑 / family / family/tags / family/messages（无 spaces、无 item detail）
- [ ] 分包 `packageBrowse`：spaces 列表与详情、物品详情；家庭页 Wi‑Fi 可预下载
- [ ] 氛围图上传前压缩（边长/质量上限）；失败则回退原图仍可上传
- [ ] 清单返回静默刷新；主题未变时不重复全量 setData theme
- [ ] Workers：清单派生字段可走 worker，不可用时主线程降级仍正常

## B 波：标签

- [ ] 家庭页可进标签管理；首次打开会种子默认标签（药品/饮料/工具/衣物）；删掉后不自动补种
- [ ] 可新建 / 重命名 / 删除标签；删除后物品上的该 tagId 被剥离
- [ ] 编辑页可多选标签；详情展示标签名；清单可按单标签筛选并可清回「全部标签」
- [ ] 跨家庭 tagId 写入被 `item` 拒绝

## B 波：保质期与即将过期

- [ ] 编辑可填/清除生产日、过期日（均可空）；无过期日则无临期状态
- [ ] 详情与清单展示临期/已过期标识（窗：今天…今天+3）
- [ ] 清单顶部「即将过期」模块：有临期/过期物资时出现，点进详情；提醒开关关闭的物资仍会出现
- [ ] 切换家庭后模块与清单只反映当前家

## B 波：订阅提醒

- [ ] 物资提醒开关默认关，且**跟当前账号走**（A 订阅花菜后，B 打开同一条仍是未订阅）
- [ ] B 可在同一物资上自行打开开关并弹出微信授权，互不影响
- [ ] 家庭总开关默认开（家庭页可点切换）
- [ ] 开启物资提醒时尝试 `requestSubscribeMessage`；拒绝不阻断保存
- [ ] 接受授权后 `recordSubscribeExpire` 写入 membership
- [ ] `expireNotify`：对 3 天/1 天/当天、家庭总开关开启、且该物资有订阅记录的成员发送；发送成功后该人该物品变为未订阅；须从小程序端或 IDE 定时触发器触发（控制台测试无 openapi 鉴权）
- [ ] 控制台：上传 `expireNotify`、启用定时触发器（见 `config.json` 每日 9:00）；家庭页「立即检查提醒」可手动触发验收

## C 波：家庭消息 / 活动日志

- [ ] 物资 create / update（有字段变更）/ remove 成功后写入 `activities`；校验失败不写
- [ ] `createMany`（n≥2）消息中心只出现一条 `create_batch`（如「家人加入了牛奶、纸巾等8件物品」）；n=1 仍是普通 create
- [ ] 免费档家庭消息库内保留 ≤30 条；加强版 ≤200；超限删最旧；订阅过期回落后下次写入压到 30
- [ ] 消息列表滑到底：免费显示「免费版最多30条」、加强版显示「消息上限200条」（用 list 顺带字段，不另调 getEntitlement）
- [ ] 家庭页可进「消息中心」；倒序展示谁增删改了什么；无昵称显示「家人」；有称呼/头像时消息行显示头像
- [ ] 新日志句式对齐 UI：新增「家人在厨房里加入了啤酒」；删除「家人在厨房里删除了啤酒」；修改「家人在厨房里修改了啤酒x5」；有位置时为「在厨房冰箱里」
- [ ] 消息中心空状态使用 `/assets/no_data.png`，文案「暂无消息哦～记一件物品就会出现」；列表行时间在右侧
- [ ] 空家庭显示空态；加载失败可重试；**无**评论/发帖框
- [ ] 物资详情展示该物品最近操作（含头像）；无记录时不阻断详情
- [ ] 硬删物资后家庭消息仍可见删除行（名称快照）；**无**软删除物资本体
- [ ] 切换家庭后消息流只显示当前家；非成员读不到他家活动
- [ ] 解散家庭后 `activities` 一并清理
- [ ] 上传云函数 `item` / `ai`（含截断）与 `activity`（列表按档位 cap）

## 用户体系（昵称 / 头像）

- [ ] 家庭页顶部是「我的资料」行（头像+称呼），点开半屏只改自己的称呼/头像
- [ ] 「我加入的家庭」里当前家的「N人」可点，弹层只读展示家里的人
- [ ] 半屏用微信 `chooseAvatar` + `input type="nickname"`
- [ ] 保存后 `users.nickname` / `users.avatarUrl` 更新；消息中心与物资详情最近操作能认出操作人
- [ ] 头像上传云存储 `user-avatars/`；换头像后旧 fileID best-effort 删除
- [ ] 客户端不能直写 `users`（安全规则 write false）；须走 `family.updateProfile`
- [ ] 上传云函数 `family`（含 `updateProfile` / `listMembers`）与 `activity`（列表带回 `actorAvatarUrl`）

## AI 密钥

- [ ] 家庭页 AI 额度行进 `packageAi/keys`；添加 key 只需粘贴密钥（可选名称），不出现 baseUrl / 模型输入框
- [ ] `listKeys` 与页面只有掩码，没有完整 key
- [ ] 家庭成员 B 能使用成员 A 配置的 key 完成一次助手对话
- [ ] 默认一把；删掉默认后仍剩的 key 会有新默认
- [ ] 第四把添加失败
- [ ] 无 key 时助手有明确引导进密钥页，不出现 Axios 堆栈
- [ ] 解散家庭后该家 `familyAiKeys` 被清掉
- [ ] 普通成员离开不影响家里剩余成员继续用 key
- [ ] 切换家庭后，助手与密钥列表作用于新的当前家
- [ ] 产品 `app.json` 主包 pages 列表不恢复 `pages/chat`

## 约束

- [ ] 客户端直写 `items` / `spaces` / `locations` / `tags` / `activities` / `itemExpireSubs` / `familyAiKeys` / `aiPrompts` / `familyTrees` / `aiCapabilities` / `redeemCodes` / `familySubscriptions` 被安全规则拒绝
- [ ] 已有家庭仍可再创建；join 已加入的同一家庭返回 `ALREADY_IN_FAMILY`
- [ ] 家庭页可切换当前家庭；离开/解散后若还有其他家庭则切过去，否则回 onboarding
- [ ] 家庭背景：渐变 / 纯色 / 图片可设；标题为「家庭 {名称}」
- [ ] `memberships` / `items` / `spaces` / `tags` / `activities` 列表查询走索引（无「缺少索引」报错）

## 容量会员（内测兑换）

对照 `docs/plans/2026-09-21-capacity-membership-redeem/` 与 `openspec/changes/capacity-membership-redeem/`。

### 部署前

- [ ] 集合 `redeemCodes`、`familySubscriptions` 已建；规则按 `database-rules.json` 粘贴
- [ ] 云函数 `family` 配置环境变量 `ADMIN_OPENID`；上传 `family` / `item`（助手建物资则同步 `ai`）
- [ ] 云函数 `ai` 若需展示申请内测联系方式，配置 `CAPACITY_ADMIN_WECHAT`（勿写进仓库）
- [ ] `families` 新文档含 `itemCount: 0`（老家庭首次创建物资时会懒校准）

### 手测

- [ ] 新用户可建 1 家；再建第二家返回 `FAMILY_LIMIT_REACHED`（无站外购买引导）
- [ ] 免费家最多 2 人；第三人 join 返回 `MEMBER_LIMIT_REACHED`
- [ ] 免费家庭可创建至 50 件；第 51 件返回 `ITEM_LIMIT_REACHED` 且文案引导家庭页内测兑换
- [ ] admin 调 `family.issueCodes` 成功（可传 `durationAmount`+`durationUnit`）；非 admin 被 `FORBIDDEN`
- [ ] 家庭页「加强版」展示未开通 / 件数（及可选人数）进度；兑码成功后显示到期日
- [ ] 兑码后：可再加家、加人、加物资（不限）
- [ ] 未过期再兑：到期日按剩余叠加
- [ ] 过期后回落免费上限；已有超额家/人/物不踢不删，但不可再增
- [ ] 解散家庭后该家 `familySubscriptions` 被删
- [ ] 清单 / 搜索 / 首页加载不额外风暴式调用 `getEntitlement`
- [ ] `createMany` 一批超过剩余名额整批失败
- [ ] `createMany`（n≥2）只产生一条家庭消息；免费家消息总数 ≤30、加强家 ≤200
- [ ] AI `act` 不因「无容量会员」被拦（仍可因撞物资上限失败）

## 导航

- [ ] 产品入口含 onboarding / items / family / family/tags / family/messages；空间与物品详情在分包 `packageBrowse`；AI 密钥在分包 `packageAi`；家庭管家在分包 `packageAiAssist`（无 demo、chat）
- [ ] `chatProxy` 目录仍在，未挂产品导航

## AI 助手 V2

- [ ] 清单顶栏进 `packageAiAssist`（无 focus）；返回后清单拉数与筛选不变
- [ ] 家庭页 AI 额度行仍进 `packageAi/keys`（密钥）
- [ ] 物资详情有助手入口，带上当前 `itemId` 作为 focus；编辑/删除主按钮仍在
- [ ] 助手页是对话列表：发送后清空输入，汇报/追问出现在气泡里；没有语音、没有选图送模型；无家时回 onboarding
- [ ] 无密钥时不调模型，引导现有密钥页
- [ ] 追问展示芯片或确认删；下一句带着最近对话上下文重跑 `ai.act`；两轮仍缺槽则引导现有编辑页
- [ ] `ai.act` 走当前家庭 membership，忽略伪造 familyId；空文本拒绝
- [ ] 计划 `ask` 非空则零写入；删除无确认不执行；`source: agent`
- [ ] 树含空间/位置/标签、不含物资；结构写后更新；解散删树、离开不删
- [ ] 操作汇报由代码拼出（含可能重复、不合并）；与密钥页并存
- [ ] 助手本地按家庭保留最近 20 条文字气泡；`ai.act` history 同为 20；冷启动不恢复确认卡/芯片/结果卡；满额时列表顶有「只保留这么多」提示

## AI 助手 agent-runtime（标准循环，无意图预路由）

对照 `openspec/changes/ai-assist-agent-runtime/`。`ai.act`：Context → Model → Tools / reply → Guardrails；无关键词跳过模型。

- [ ] 问「有几个空间/房间/位置」：仍调模型；用 TREE 的 reply 回答，不出现代码整树倾倒替代模型计划
- [ ] 问「冰箱里有什么 / 家里有什么吃的」：不因正则强制 probe；由模型出 probe/search；库存事实来自探查/工具/FOCUS，非模型臆造
- [ ] 说「打开临期订阅 / 过期提醒」：先调模型；模型可 `item.expireSubscribePanel`；端上出现订阅开关面板（`status: subscribe`），助手不能代开授权
- [ ] 删除物资：无确认不删；确认后重放绑定 itemId 的 calls，不再问模型
- [ ] 无家庭 AI 密钥：返回 `NO_AI_KEY`，不调模型
- [ ] 计划含 `family.*` / `ai.*`（硬底线）或未启用能力：不执行，能力有限追问
- [ ] 确认重放与正常回合的 done/ask/confirm/subscribe 协议字段与改前兼容（`subscribeItems` 不变）
