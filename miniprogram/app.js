// app.js
require("/extend/page/index"); // 页面扩展
require("/extend/component/index.js"); // 组件扩展
const { autoUpdate } = require("./utils/update.js");
import RequestUrl from "./utils/api";
import BaseParams from "./utils/params";
import RequestManager from "./utils/request";
const { setStorage } = require("./utils/storage")
const { getParamsFormWxacode } = require("./utils/util")
const { envId: cloudEnvId } = require("./utils/cloudbase-env")

const env = "prod"

if (!wx._requestUrl) wx._requestUrl = new RequestUrl(env);
if (!wx._baseParams) wx._baseParams = new BaseParams(env);
if (!wx._requestManager) wx._requestManager = new RequestManager(env);

// Worker 可选：失败不影响主路径（清单派生会主线程降级）
try {
  if (!wx._workers && wx.createWorker) {
    const Workers = require("./utils/workers")
    wx._workers = new Workers()
  }
} catch (e) {
  console.warn('[workers] init skipped', e)
}

App({
  onLaunch(options) {
    if (wx.cloud) {
      const initOpts = { traceUser: true }
      if (cloudEnvId) {
        initOpts.env = cloudEnvId
      }
      wx.cloud.init(initOpts)
      console.log('[cloud] init', cloudEnvId || '(未指定 env，使用工具默认环境)')
    }
    console.log("小程序冷启动入参", options)
    wx.onNetworkStatusChange(function (res) {
      let { isConnected } = res;
    })
    wx.onMemoryWarning((res) => {
      console.log(res);
    })
    wx.onCopyUrl(() => {
      return { query: 'from=copyUrl' }
    })
    wx.offCopyUrl()
  },
  onShow(options) {
    if (options?.query) {
      const { scene } = getParamsFormWxacode(options.query);
      scene && setStorage('EnterScene', scene)
    }
    autoUpdate();
  },
  onError: function (error) { },
  onUnload: function () {
    wx.offMemoryWarning(() => { });
  },
  globalData: {
    config: null,
    familyId: null,
    family: null,
    theme: null
  }
})
