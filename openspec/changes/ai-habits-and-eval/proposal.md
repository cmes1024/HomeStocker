## Why

课表阶段刻意不做「记住这家习惯」和「自动评测」。现在核心办事已稳，缺两块：可验收的全局/本家习惯配额（约 10 条，不无限膨胀），以及可誊抄答卷的真实题库，避免只靠手工验收。

## What Changes

- 锁定习惯配额：**全局 5 条**（prompt/knowledge）+ **每家 5～7 条**（持久化并注入 act 上下文）
- 习惯是事实/偏好，禁止用作 NL→接口路由
- 新增独立目录 `ai-eval/`：题库只读、按计划开跑、每次誊抄到 `runs/` 写答卷
- 首批产品向用例从课表核心轨迁入；runner 支持 mock 判定；真模型档后置
- 能力表增加本家习惯读写 tool（list / upsert / remove）

## Capabilities

### New Capabilities
- `ai-family-habits`: 家庭级习惯存储、上限、注入 act、tool 读写
- `ai-eval-bank`: 评测题库目录约定、计划开跑、答卷归档（工程产物；行为合同写在 spec）

### Modified Capabilities
- `ai-assistant-act`: system 注入全局习惯与本家习惯；习惯不得改写计划路由
- `ai-capability-registry`: 登记 `habit.list` / `habit.upsert` / `habit.remove`

## Impact

- Java：`AssistPromptTexts`、`ActPrompt`、`ActContextBuilder`、Flyway、`DomainTools`、能力种子
- 仓库根：`ai-eval/` 题库与 runner
- 文档：`docs/plans/2026-10-02-ai-habits-and-eval/`
- 小程序：本版可不改 UI（对话经 tool 改习惯）；设置页可后置
