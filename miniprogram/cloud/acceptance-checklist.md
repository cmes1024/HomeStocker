# MVP 双账号验收清单

部署前：创建集合与索引（见 `collections.md`）、粘贴安全规则、上传云函数 `family` / `item`（云端安装依赖）。

## 闭环

- [ ] 账号 A 创建家庭，获得 6 位邀请码
- [ ] 账号 B 用邀请码加入同一家庭
- [ ] A/B 均可对同一批物资增删改查（名称、数量、备注）
- [ ] 未加入家庭的账号看不到该家庭物资

## 约束

- [ ] 客户端直写 `items` 被安全规则拒绝
- [ ] 已有 membership 再 create/join 返回 `ALREADY_IN_FAMILY`
- [ ] Owner 解散后双方回到 onboarding，可重新创建/加入
- [ ] 非 owner 离开后回 onboarding，memberCount 减少
- [ ] `memberships` / `items` 列表查询走索引（无「缺少索引」报错）

## 导航

- [ ] 产品入口仅为 onboarding / items / family（无 demo、chat）
- [ ] `chatProxy` 目录仍在，未挂产品导航
