const { callFamily } = require('../../utils/cloud')

Page({
  data: {
    loading: true,
    error: '',
    family: null,
    acting: false
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const family = await callFamily('getMyFamily')
      this.setData({ family, loading: false })
      const app = getApp()
      app.globalData.family = family
      app.globalData.familyId = family._id
    } catch (e) {
      if (e.code === 'NO_FAMILY') {
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      this.setData({
        loading: false,
        error: e.message || '加载失败'
      })
    }
  },

  onRetry() {
    this.load()
  },

  onCopyCode() {
    const code = this.data.family && this.data.family.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '已复制邀请码', icon: 'success' })
    })
  },

  async onLeave() {
    if (this.data.acting) return
    const family = this.data.family
    if (!family) return

    const isOwner = family.isOwner
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: isOwner ? '解散家庭' : '离开家庭',
        content: isOwner
          ? '将删除本家庭全部物资与成员关系，且不可恢复。确定？'
          : '离开后将无法查看本家庭物资。确定？',
        confirmColor: '#FA5151',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return

    this.setData({ acting: true })
    try {
      await callFamily('leave')
      const app = getApp()
      app.globalData.family = null
      app.globalData.familyId = null
      wx.reLaunch({ url: '/pages/onboarding/index' })
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
      this.setData({ acting: false })
    }
  }
})
