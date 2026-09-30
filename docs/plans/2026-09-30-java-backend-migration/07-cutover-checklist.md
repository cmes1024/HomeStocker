# 07 — 切流与关云开发清单

在 M9/M10 使用。未到阶段不要关云开发。

## 1. 双跑规则

1. 同一家庭同一时间只允许**一侧写**（开关按全局或按家庭）。  
2. 读可以短期打 Java，但写仍云函数时，注意缓存 cursor 两侧不一致——优先「整模块读写一起切」。  
3. openid 必须一致（都来自同一微信身份）。  
4. 回滚：路由开关改回 `cloud`，无需清库（注意双写窗口产生的分叉）。

## 2. 切流顺序（再次强调）

auth → family → item → space/tag → activity → storage → notify → ai → 去掉云初始化

## 3. 关云函数前 grep

在 `miniprogram/`（排除 packageDemo / cloudfunctions）确认无：

- `wx.cloud.callFunction`
- `wx.cloud.uploadFile` / `deleteFile`（产品路径）
- `wx.cloud.init` 强依赖启动失败

## 4. 关云开发控制台

- [ ] 关闭 `expireNotify` 定时触发器  
- [ ] 停用/删除云函数（备份代码已在 git）  
- [ ] 文档库只读或归档导出后删除  
- [ ] 云存储归档后删除  
- [ ] 确认账单项不再增长  

## 5. 上线服务器最低配

- [ ] 安装 Docker（不必装 JDK/Maven）  
- [ ] 使用与仓库相同的 Compose（可加 `docker-compose.prod.yml` 覆盖）拉起 `api` + 依赖  
- [ ] Postgres 数据卷备份计划  
- [ ] Redis 持久化或可丢失 session 的明确策略  
- [ ] HTTPS 反代（Nginx/Caddy 容器或宿主机）  
- [ ] 环境变量与密钥注入（勿打进镜像）  
- [ ] 微信小程序后台：request 合法域名、uploadFile 域名  
- [ ] `curl https://<域名>/api/health` 与日志落盘  

## 6. 发布当日

- [ ] 维护窗口公告（若有用户）  
- [ ] 导入/校验数据  
- [ ] 打开 Java 全量开关  
- [ ] 跑「全量回归清单」（roadmap）  
- [ ] 监控错误率 1–2 小时  
- [ ] 云函数触发器确认已关  

## 7. 回滚预案

1. 小程序配置回指向云函数（旧版本或开关）  
2. 恢复定时触发器  
3. 记录分叉数据，必要时以云开发导出为准或反向同步（尽量避免需要）
