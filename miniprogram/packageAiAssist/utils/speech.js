/**
 * 微信同声传译：语音输入。插件在 app.json 声明为 WechatSI。
 * 按住说话，松开后由页面决定发送或取消。
 */

function getManager() {
  const plugin = requirePlugin('WechatSI')
  return plugin.getRecordRecognitionManager()
}

function ensureRecordAuth() {
  return new Promise((resolve, reject) => {
    const authorize = () => {
      wx.getSetting({
        success(res) {
          const setting = (res && res.authSetting) || {}
          if (setting['scope.record']) {
            resolve()
            return
          }
          if (setting['scope.record'] === false) {
            const err = new Error('denied')
            err.denied = true
            reject(err)
            return
          }
          wx.authorize({
            scope: 'scope.record',
            success: resolve,
            fail(e) {
              const err = new Error((e && e.errMsg) || 'denied')
              err.denied = true
              reject(err)
            }
          })
        },
        fail: reject
      })
    }
    if (typeof wx.requirePrivacyAuthorize === 'function') {
      wx.requirePrivacyAuthorize({ success: authorize, fail: reject })
      return
    }
    authorize()
  })
}

module.exports = {
  getManager,
  ensureRecordAuth
}
