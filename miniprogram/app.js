// app.js
require("/extend/page/index"); // 页面扩展
require("/extend/component/index.js"); // 组件扩展
const { autoUpdate } = require("./utils/update.js"); // 小程序版本更新
import RequestUrl from "./utils/api";
import BaseParams from "./utils/params";
import RequestManager from "./utils/request";
import Workers from "./utils/workers";
const { setStorage } = require("./utils/storage")
const { getParamsFormWxacode } = require("./utils/util")

const env = "prod" // 初始化环境

if (!wx._requestUrl) wx._requestUrl = new RequestUrl(env); // 域名、接口类
if (!wx._baseParams) wx._baseParams = new BaseParams(env); // 基础参数类
if (!wx._requestManager) wx._requestManager = new RequestManager(env); // 网络请求类
if (!wx._workers) wx._workers = new Workers(); // 创建线程、事件订阅和发布

App({
  onLaunch(options) {
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true }) // 云开发初始化（AI 对话走云函数中转）
    }
    console.log("小程序冷启动入参", options)
    // 监控网络变化
    wx.onNetworkStatusChange(function (res) {
      let { isConnected } = res;
    })
    // 监控内存告警
    wx.onMemoryWarning((res) => {
      console.log(res);
    })
    // 监听复制短链
    wx.onCopyUrl(() => {
      return { query: 'from=copyUrl' }
    })
    // 取消绑定分享参数
    wx.offCopyUrl()
  },
  onShow(options) {
    // 记录进入场景
    if (options?.query) {
      const { scene } = getParamsFormWxacode(options.query);
      scene && setStorage('EnterScene', scene)
    }
    // 检测并触发更新
    autoUpdate();
  },
  onError: function (error) { },
  onUnload: function () {
    wx.offMemoryWarning(() => { });
  },
  globalData: {
    config: null
  }
})
