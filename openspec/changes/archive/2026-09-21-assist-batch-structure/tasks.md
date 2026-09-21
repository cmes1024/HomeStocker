## 1. Domain

- [x] 1.1 `spaceWrite`：`createSpace` / `createMany`；space CF + ai 共用
- [x] 1.2 `locationWrite.createLocationMany`（双份）
- [x] 1.3 `space/index.js` 挂 createMany / createLocationMany 并 touch 树

## 2. Assistant

- [x] 2.1 tools：spaceCreate / spaceCreateMany / spaceCreateLocationMany + registry
- [x] 2.2 capabilities 启用 + prompt 最优编排
- [x] 2.3 collections / 方案 / 验收清单

### 验收清单（部署 `space` + `ai` 后）

1. 「建主卧次卧，各加衣柜，再各放一件衣服」→ calls 应为 `space.createMany` → `space.createLocationMany` → `item.createMany`（或等价最少 Many 步）。
2. 「建一个书房」→ `space.create` 单条。
3. createLocationMany 指向不存在的空间 → 零写入。
4. 能力表 version ≥ 9；prompt version ≥ 24。
5. 改名/删空间仍走能力边界话术，不执行。
