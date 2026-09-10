const { callFamily } = require('../../utils/cloud')
const { routeByMembership } = require('../../utils/route')

Page({
  data: {
    bootLoading: true,
    bootError: '',
    mode: 'choose', // choose | create | join
    familyName: '',
    inviteCode: '',
    submitting: false,
    formError: ''
  },

  async onShow() {
    try {
      await routeByMembership(this, 'onboarding')
    } catch (e) {
      // bootError 已设置
    }
  },

  onRetryBoot() {
    this.onShow()
  },

  goCreate() {
    this.setData({ mode: 'create', formError: '', familyName: '' })
  },

  goJoin() {
    this.setData({ mode: 'join', formError: '', inviteCode: '' })
  },

  goChoose() {
    this.setData({ mode: 'choose', formError: '' })
  },

  onNameInput(e) {
    this.setData({ familyName: e.detail.value })
  },

  onCodeInput(e) {
    this.setData({ inviteCode: (e.detail.value || '').toUpperCase() })
  },

  async onCreate() {
    if (this.data.submitting) return
    const name = (this.data.familyName || '').trim()
    if (!name) {
      this.setData({ formError: '请输入家庭名称' })
      return
    }
    this.setData({ submitting: true, formError: '' })
    try {
      const family = await callFamily('create', { name })
      const app = getApp()
      app.globalData.familyId = family._id
      app.globalData.family = family
      wx.reLaunch({ url: '/pages/items/index' })
    } catch (e) {
      this.setData({
        formError: e.code === 'ALREADY_IN_FAMILY' ? '你已加入家庭' : (e.message || '创建失败')
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onJoin() {
    if (this.data.submitting) return
    const inviteCode = (this.data.inviteCode || '').trim().toUpperCase()
    if (!inviteCode) {
      this.setData({ formError: '请输入邀请码' })
      return
    }
    this.setData({ submitting: true, formError: '' })
    try {
      const family = await callFamily('join', { inviteCode })
      const app = getApp()
      app.globalData.familyId = family._id
      app.globalData.family = family
      wx.reLaunch({ url: '/pages/items/index' })
    } catch (e) {
      let msg = e.message || '加入失败'
      if (e.code === 'ALREADY_IN_FAMILY') msg = '你已加入家庭'
      if (e.code === 'INVALID_CODE') msg = '邀请码无效'
      this.setData({ formError: msg })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
