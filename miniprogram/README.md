# miniprogram
微信小程序模版

## 架构设计

### 扩展层 (/extend)
通过劫持 Page() 和 Component() 构造函数，自动注入公共能力和系统信息。
所有页面和组件在创建时自动获得：
- 胶囊位置信息 (menuPositionInfo)
- 系统信息 (windowInfo / deviceInfo / systemSetting)
- 公共 behaviors（表单能力、trait模式、组件导出等）
- pageRouter 通信能力

### 核心设计模式

#### 1. pageRouter —— 页面级通信路由
组件在 attached 时将自身方法注册到 `this.pageRouter`，页面直接调用：
```javascript
this.pageRouter.loading()          // 控制 Loading 组件
this.pageRouter.softAgreementCheck() // 协议软校验
```
组件通过 `registerToRouter()` / `registerComponentMethods()` 注册自身能力。

支持 glass-easel Behavior.trait 增强模式（见 `/extend/behaviors/commonBehrs/traitBehr.js`）

#### 2. 请求编排 (RequestManager)
三层架构：config → 域名/环境映射 | api → URL装配 | request → 请求管理
- 白名单机制：关键接口优先请求，其余排队等候
- 空闲调度：支持 `options.idle` 在 requestIdleCallback 中发起非关键请求
- 超时/登录态/错误码统一处理

#### 3. Worker 线程事件通信
发布订阅模式封装 wx.createWorker：
- 主线程订阅/监听事件
- Worker 处理完后通过 key 回传
- 自动重建（onProcessKilled 回调）

#### 4. 隐私合规处理
- agreement 组件：软校验（间隔重弹）/ 强校验（未同意就弹）
- privacyPopup 组件：对接 wx.onNeedPrivacyAuthorization + wx.getPrivacySetting

### v2026 架构升级要点

#### 系统信息拆分
```javascript
// 旧：一次拉取全部
this.data.systemInfo

// 新：按需获取
this.data.windowInfo    // wx.getWindowInfo() — 窗口尺寸、安全区域
this.data.deviceInfo    // wx.getDeviceInfo() — 设备品牌、型号、系统
this.data.systemSetting // wx.getSystemSetting() — 蓝牙、定位、WiFi、方向
```

#### requestIdleCallback 空闲调度
非关键请求通过 `preTreatment({ idle: true, idleTimeout: 3000 })` 触发，
在浏览器空闲时段执行，避免阻塞用户交互。

#### Worklet 动画迁移
- Loading 组件：`components/loading/worklet.worklet.js` — 渲染线程动画
- maskElement 组件：`components/maskElement/worklet.worklet.js` — 渲染线程事件处理
- 保留 CSS/WXS 实现作为降级，取消 Worklet require 注释即可启用

#### glass-easel Behavior.trait
形式化的组件契约声明，组件通过 trait 暴露能力，其他组件通过 `this.$('traits.xxx')` 发现。
与 pageRouter 互补：trait 提供类型安全契约，pageRouter 提供动态注册。

## 组件

| 组件 | 说明 |
|------|------|
| Header | 自定义导航栏（胶囊区域适配） |
| loading | 两球环绕加载动画 |
| Modal | 底部弹出面板（基于 page-container） |
| agreement | 使用协议校验（软/强两种模式） |
| maskElement | 点击防抖遮罩 |
| privacyPopup | 微信隐私保护指引弹窗 |

## 工具模块

| 文件 | 说明 |
|------|------|
| utils/api.js | URL 装配（点语法路径查找） |
| utils/config.js | 域名、环境映射配置 |
| utils/params.js | 通用参数 + 用户中心签名 |
| utils/request.js | 请求管理器（队列/空闲调度/超时） |
| utils/workers.js | Worker 线程发布订阅封装 |
| utils/storage.js | 缓存读写 |
| utils/util.js | 手机号/表情校验、太阳码解析等 |
| utils/common.js | 网络异常文案统一处理 |
| utils/update.js | 小程序版本自动更新 |
