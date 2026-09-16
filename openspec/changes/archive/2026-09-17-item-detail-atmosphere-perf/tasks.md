## 1. 物品详情路径

- [x] 1.1 新增 `pages/items/detail`（读 item.get / 展示字段 + 编辑/删除入口与文案）
- [x] 1.2 清单 `pages/items/index`：点击进详情；移除长按删除；卡片保持简要信息
- [x] 1.3 详情删除确认后调 `item.remove`，成功返回清单；编辑跳转现有 edit 页
- [x] 1.4 注册路由（先主包可跑通，分包在 3.x 再挪）

## 2. 氛围图云存储清理

- [x] 2.1 `family.updateBackground`：旧图 fileID 与新值不同或改为非 image 时 best-effort `deleteFile`
- [x] 2.2 `leave` / 解散路径：家庭背景为 image 时 best-effort 删文件；失败不阻断主流程
- [x] 2.3 客户端上传前可先不压缩（压缩放 3.2）；验收换图与退家场景

> 2.2 说明：仅 **owner 解散** 时回收氛围图；普通成员 `leave` 不删（家庭仍在，其他成员需继续用该背景）。与 delta 场景「Dissolve family with photo background」一致。

## 3. 性能：分包与异步

- [x] 3.1 `app.json` 配置分包：空间页 + 物品详情迁入分包；修正跳转与预下载策略（按需）
- [x] 3.2 非关键路径去掉首屏预拉（如有）；确认主包体积下降

> 3.1：`packageBrowse`（spaces/* + items/detail）；家庭页 Wi‑Fi 预下载 browse 包。编辑页留主包。
> 3.2：主包页仅 onboarding / items 清单与编辑 / family；无首屏预拉空间页。清单筛选用的 `listSpaces` 属业务数据，非分包页预拉。

## 4. 性能：轻量优化

- [x] 4.1 氛围图上传压缩（边长/质量上限）
- [x] 4.2 清单/详情减少多余 `setData`；沿用或补齐静默刷新
- [x] 4.3 避免重复全量刷主题的明显浪费点

## 5. 性能：Workers

- [x] 5.1 选定一处纯计算候选并接入 worker，或在 tasks/验收中明确延期原因
- [x] 5.2 若接入：保证降级路径（无 worker 时主线程仍可用）

> 5.1：候选为清单卡片派生（spaceName / locationName / placeLine）；`workers/index.js` → `enrichLedgerItems`。
> 5.2：`runLedgerEnrich.enrichLedgerItemsAsync` 在无 `wx._workers` / 超时 / 异常时主线程 `ledgerEnrich` 降级。

## 6. 文档与验收

- [x] 6.1 更新 `acceptance-checklist.md`（详情路径、氛围清理、分包）
- [x] 6.2 对照 A 波设计验收要点自测通过

> 6.2 静态核对：清单无 longpress；详情 edit/remove 路径齐全；family deleteFile 换图/解散；主包无 spaces/detail；压缩/主题去重/worker+降级已接入。真机/开发者工具需另验云函数部署与上传压缩、worker 运行时。

