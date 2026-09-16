## Why

清单点击直接进编辑，缺少「先看再改」；氛围照片更换后旧文件留在云存储造成浪费；主包随空间等页面变重，需要先拆分包与异步加载，再做轻量优化与 Workers。

## What Changes

- 新增物品详情页：清单点击仅进详情；详情提供编辑与删除；**移除**清单长按删除
- 家庭氛围图：更换（含改为渐变/纯色）时删除旧云文件；成员退出或解散家庭时删除该家背景图
- 性能按序：① 分包 + 异步加载 → ② 轻量优化（setData/压缩/静默刷新）→ ③ Workers 接入可计算逻辑
- **不做（本 change）**：标签、保质期、订阅消息、即将过期模块、家庭消息流、为新而新的交互实验（见路线 B/C/D）

## Capabilities

### New Capabilities
- `item-detail`: 物资详情浏览与从详情发起编辑/删除
- `atmosphere-storage-cleanup`: 家庭氛围图片云存储回收
- `miniprogram-perf`: 分包、异步加载、轻量优化与 Workers 顺序落地

### Modified Capabilities
- （无主库已归档能力需改；本波以新能力 delta 为准）

## Impact

- 小程序：`pages/items/index`、新建 `pages/items/detail`、`app.json` 分包、`family` 云函数氛围/退家/解散路径、上传压缩与可选 workers
- 文档：`AGENTS.md` 下一版指针；路线见 `docs/plans/2026-09-10-next-abcd-roadmap.md`
- 云存储：依赖 `cloud.deleteFile`；删除失败不阻断业务写
