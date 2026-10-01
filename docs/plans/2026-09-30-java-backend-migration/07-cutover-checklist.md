# 07 — 切流与关云开发清单

> **客户端切流状态（2026-10-01）：** 产品路径已全量 `backendRoute=java`，已去掉 `wx.cloud.init` / `callFunction` / 新产品上传；家庭页「立即检查提醒」走 `/api/notify/expire/run`；MinIO 用 `public-endpoint`。  
> 仍须：**启动 Docker 引擎后 Compose 联调**。控制台关云、存量 `cloud://` 图迁移属 **M10（本轮明确不做）**。

## 1. 双跑规则（历史）

1. 同一家庭同一时间只允许**一侧写**。  
2. 回滚：`backendRoute.js` 对应模块改回 `cloud`（须仍部署云函数；当前 `cloud.js` 会抛 `CLOUD_RETIRED`）。

## 2. 切流顺序（已完成于客户端）

auth → family → item → space/tag → activity → storage → notify → ai → bootstrap → 去掉云初始化 ✅

## 3. 关云函数前 grep（产品路径）

在 `miniprogram/`（排除 `packageDemo` / `cloudfunctions`）应无：

- [x] `wx.cloud.callFunction`（主路径已清）  
- [x] `wx.cloud.uploadFile`（主路径已清；走 `/api/storage/upload`）  
- [x] `wx.cloud.init` 启动依赖（`app.js` 已移除）  

存量 `cloud://` 展示：关云后临时链不可用，列表可能空白图，待 M10 迁对象存储。

## 4. 关云开发控制台（运维待办）

- [ ] 关闭 `expireNotify` 定时触发器  
- [ ] 停用/删除云函数（代码备份在 `miniprogram/cloudfunctions/`，见该目录 README）  
- [ ] 文档库只读或归档导出后删除  
- [ ] 云存储归档后删除  
- [ ] 确认账单项不再增长  

## 5. 上线服务器最低配

- [ ] 安装 Docker（不必装 JDK/Maven）  
- [ ] Compose 拉起 `api` + Postgres + Redis + MinIO  
- [ ] Postgres 备份计划  
- [ ] Redis 策略  
- [ ] HTTPS 反代  
- [ ] 环境变量与密钥  
- [ ] 微信后台：request 合法域名（API）；uploadFile 可不配（上传走 `wx.request`）  
- [ ] 图片展示：`MINIO_PUBLIC_ENDPOINT` 对小程序可达（同域反代或单独图床；不占 request）  
- [ ] `curl https://<域名>/api/health`  

## 6. 发布当日

- [ ] 维护窗口（若有用户）  
- [ ] 导入/校验数据（M10）  
- [ ] 确认 `backendRoute` 全 java  
- [ ] 跑 roadmap「全量回归」  
- [ ] 监控 1–2 小时  
- [ ] 云函数触发器确认已关  

## 7. 回滚预案

1. 恢复云函数部署 + 将 `backendRoute` 改回 cloud，并临时恢复 `cloud.js` 的 callFunction 分支  
2. 恢复定时触发器  
3. 分叉数据以导出为准或反向同步（尽量避免）
