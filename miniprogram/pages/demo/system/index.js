Page({
  data: {
    windowInfo: {},
    deviceInfo: {},
    systemSetting: {},
    menuPosition: {},
    hasDeviceInfo: false,
    hasSystemSetting: false,
  },
  onLoad() {
    // 使用扩展层拆分后的独立系统信息
    const windowInfo = this.data.windowInfo || wx.getWindowInfo?.() || {}
    this.setData({
      windowInfo,
      menuPosition: this.data.menuPositionInfo || wx.getMenuButtonBoundingClientRect?.() || {},
    })

    // deviceInfo 和 systemSetting 是 v2.27+ 的独立 API
    const deviceInfo = this.data.deviceInfo || wx.getDeviceInfo?.() || {}
    const systemSetting = this.data.systemSetting || wx.getSystemSetting?.() || {}

    if (wx.getDeviceInfo) {
      this.setData({
        deviceInfo,
        hasDeviceInfo: true,
      })
    }
    if (wx.getSystemSetting) {
      this.setData({
        systemSetting,
        hasSystemSetting: true,
      })
    }
  },
  formatJSON(obj) {
    if (!obj || Object.keys(obj).length === 0) return '(空)'
    return JSON.stringify(obj, null, 2)
  },
})
