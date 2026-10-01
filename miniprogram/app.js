// app.js
require("/extend/page/index"); // 页面扩展
require("/extend/component/index.js"); // 组件扩展
const { autoUpdate } = require("./utils/update.js");
const { setStorage } = require("./utils/storage")
const { getParamsFormWxacode } = require("./utils/util")
const { getThemeColors, hydrateThemeFromCache } = require("./utils/theme")
const { markAppHidden, markAppShown } = require("./utils/cloud")
const javaApi = require("./utils/javaApi")

const env = "prod"

/** 演示页 RequestManager 惰性挂载，避免拖慢冷启动主路径 */
function ensureLegacyRequestStack() {
  if (wx._requestManager) return
  try {
    const RequestUrl = require("./utils/api")
    const BaseParams = require("./utils/params")
    const RequestManager = require("./utils/request")
    if (!wx._requestUrl) wx._requestUrl = new RequestUrl(env)
    if (!wx._baseParams) wx._baseParams = new BaseParams(env)
    if (!wx._requestManager) wx._requestManager = new RequestManager(env)
  } catch (e) {
    console.warn('[request] lazy init skipped', e)
  }
}

wx.ensureLegacyRequestStack = ensureLegacyRequestStack

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
    // 同步回填上次家庭主题，避免冷启动先闪默认橙黄
    hydrateThemeFromCache()
    // Java API 登录探活
    setTimeout(() => {
      javaApi
        .ensureLogin()
        .then((data) => {
          const openid =
            (data && data.user && data.user.openid) ||
            (data && data.openid) ||
            ''
          console.log('[javaAuth] login ok', openid || '(no openid)')
        })
        .catch((e) => {
          console.warn(
            '[javaAuth] login probe failed',
            (e && e.code) || '',
            (e && e.message) || e
          )
        })
    }, 0)
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
    markAppShown()
    if (options?.query) {
      const { scene } = getParamsFormWxacode(options.query);
      scene && setStorage('EnterScene', scene)
    }
    // 更新检查不挡首屏
    setTimeout(() => {
      try {
        autoUpdate()
      } catch (e) {
        // ignore
      }
    }, 0)
  },
  onHide() {
    markAppHidden()
  },
  onError: function (error) { },
  onUnload: function () {
    wx.offMemoryWarning(() => { });
  },
  /** 当前家庭主题三色，供任意页面 / 组件调用 */
  getThemeColors() {
    return getThemeColors()
  },
  globalData: {
    config: null,
    familyId: null,
    family: null,
    theme: null
  }
})
