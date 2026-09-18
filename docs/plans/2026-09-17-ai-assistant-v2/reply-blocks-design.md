# AI 助手回复结构化块（通用结果卡）

> 目录：[`README.md`](./README.md)  
> 日期：2026-09-18  
> 状态：**已确认设计，实施中**  
> 范围：`packageAiAssist` 展示层 + `ai.act` 汇报映射；不改写路径、不改 ask/confirm/subscribe 交互协议

## 1. 问题

查库类汇报由 `formatItemRecord` / `formatSearchReport` 拼成纯文本：全字段 +「（未设）/（无）」占位 + `——` 分隔。前端助手气泡只渲染 `text`，信息密度高、难扫读。澄清芯片、确认卡、订阅行已是结构化 UI，唯独结果汇报仍停在整段字。

## 2. 目标与非目标

**目标**

- 一套**共性**回复结构，覆盖查库、写库汇报、警告、空结果、带短文归纳的绝大多数助手回复
- 有值才展示；字段由代码从台账/执行结果映射，模型不负责排版
- 前端一次写死渲染规则，多场景复用

**非目标**

- Markdown / 富文本解析
- 卡片内编辑、批量勾选、半个表单引擎
- 把 ask 芯片 / 删除合并确认 / 订阅开关塞进同一套卡（它们需要独立交互，协议保持现状）
- 改清单页列表样式；本版可不做「点卡进详情」（协议可预留 `itemId`）

## 3. 协议

助手结果消息（`status` 为 done / 带 report 的路径）在现有字段外增加：

```text
lead?: string           // 可选一句总述
blocks?: Block[]        // 0～N 组结构化块
report.lines            // 暂留：无 blocks 时前端文本兜底
```

### Block

```text
{
  title?: string,                    // 组标题，如「注意」
  tone?: 'neutral' | 'ok' | 'warn' | 'error',
  cards: Card[],
  footer?: string                    // 如「另有 3 件未展开」
}
```

### Card

```text
{
  title: string,                     // 主行（必填）
  subtitle?: string,                 // 次行一句
  facts?: string[],                  // 补充事实；空则不渲染
  tags?: string[],                   // 小标签
  tone?: 'neutral' | 'ok' | 'warn' | 'error',
  itemId?: string                    // 可选；有则日后可跳详情
}
```

### 前端渲染规则

1. 有 `lead` → 用现有助手气泡展示  
2. 每个 block：可选标题 + 卡片列表 + 可选 footer  
3. Card：只渲染非空的 `subtitle` / `facts` / `tags`  
4. `tone` → 左边色条（主题 / 成功 / 琥珀 / 红），不整卡染色  
5. 无 `blocks`（或空）且仅有 `report.lines` → 退回今日纯文本行为  

### 示例：查库存

```json
{
  "lead": "找到 9 件",
  "blocks": [
    {
      "cards": [
        {
          "title": "食用油",
          "subtitle": "4桶",
          "facts": ["厨房/冰箱", "过期 2027-09-16"],
          "tags": [],
          "itemId": "..."
        },
        {
          "title": "苹果",
          "subtitle": "2个",
          "facts": ["厨房"]
        }
      ],
      "footer": "另有 1 件未展开"
    }
  ]
}
```

### 示例：写库 + 可能重复

```json
{
  "lead": "完成 2 项",
  "blocks": [
    {
      "cards": [
        { "title": "已记下 牛奶 2瓶", "subtitle": "厨房/冰箱", "tone": "ok" },
        { "title": "已修改 白糖", "tone": "ok" }
      ]
    },
    {
      "title": "可能重复（未合并）",
      "tone": "warn",
      "cards": [
        { "title": "牛奶", "subtitle": "厨房/冰箱 · 2 条", "tone": "warn" }
      ]
    }
  ]
}
```

### 示例：仅自然语言

```json
{
  "lead": "厨房下有 2 个位置：冰箱、橱柜。",
  "blocks": []
}
```

## 4. 场景映射（后端）

| 场景 | lead | blocks |
|------|------|--------|
| 查库 / 临期 / 探查列表 | `找到 N 件` 或空结果句 | 一块；每物资一卡；截断写 footer |
| 品类归纳 | 模型短句 | 有筛后列表则附同构物资卡；否则可仅 lead |
| 写库逐步汇报 | 可选「完成 N 项」 | 每步一卡；成功 `ok`、失败 `error` |
| 可能重复 | — | 独立 warn block |
| 结构问答 / 用法 / 闲聊 | 短文 | 通常无卡 |
| 空查询 | `没有找到匹配的物品` | 空 |

### 物资卡字段映射

- `title` ← `name`
- `subtitle` ← `quantity` + `unit`（皆空则省略）
- `facts` ← 有值才推入：地点（`空间/位置` 或仅空间）、`过期 YYYY-MM-DD`、备注原文
- `tags` ← 标签名
- **禁止**再拼「名称：」「（未设）」「（无）」

展示上限与现网一致（约 8 张）+ footer。

## 5. 视觉密度

- 助手列宽保持约 84%；卡为白底轻分割，避免厚阴影与大圆角堆叠
- 主行约 28～30rpx；subtitle / facts 约 24rpx、次要色
- tags：小字 chip，不堆边框
- 与现有 `sub-row` / confirm 块气质对齐，不新开一套设计语言

## 6. 实施落点（参考）

| 位置 | 改动 |
|------|------|
| `cloudfunctions/ai/act.js` | 新增 `build*Blocks` 映射；查库/执行回报同时产出 `lead`+`blocks`；可瘦身或旁路 `formatSearchReport` 纯文本 |
| act 对外返回 | done / subscribe 等带 report 的路径附上 `lead`、`blocks` |
| `packageAiAssist/assist/index.js` | `applyResult` 写入 message 的 `lead`/`blocks`（或合并进现有 text+新字段） |
| `assist/index.wxml` + `wxss` | 通用 block/card 渲染；无 blocks 时 fallback `text` |

不改：`item`/`space` 写模型、能力表、提示词主路径、ask/confirm/subscribe。

## 7. 验收要点

- 「厨房里有什么」：摘要 + 卡片列表；无「（未设）」占行；可快速扫名称/数量/地点
- 「记下两瓶牛奶」类：成功/失败为短卡，非整段字段表
- 「厨房有哪些位置」：仅 lead，版面干净
- 旧客户端或无 blocks：仍能靠 `lines`/`text` 读懂
- 确认删除、订阅开关行为与改前一致
