const { callFamily } = require('../../utils/cloud')
const { routeByMembership } = require('../../utils/route')
const { setAppFamily, bindThemeToPage } = require('../../utils/theme')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.onboarding,
    common: copy.common,
    bootLoading: true,
    bootError: '',
    mode: 'choose',
    familyName: '',
    inviteCode: '',
    submitting: false,
    formError: '',
    theme: null,
    headerTitle: ''
  },

  onLoad(options) {
    setAppFamily(null)
    bindThemeToPage(this, { headerTitle: '' })
    const code = String((options && options.inviteCode) || '')
      .trim()
      .toUpperCase()
    if (code) {
      this.setData({ mode: 'join', inviteCode: code, formError: '' })
    }
  },

  async onShow() {
    setAppFamily(null)
    bindThemeToPage(this, { headerTitle: '' })
    try {
      await routeByMembership(this, 'onboarding')
      bindThemeToPage(this, { headerTitle: '' })
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
      this.setData({ formError: copy.onboarding.nameRequired })
      return
    }
    this.setData({ submitting: true, formError: '' })
    try {
      const family = await callFamily('create', { name })
      setAppFamily(family)
      wx.reLaunch({ url: '/pages/items/index' })
    } catch (e) {
      this.setData({
        formError: e.message || '创建失败'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async onJoin() {
    if (this.data.submitting) return
    const inviteCode = (this.data.inviteCode || '').trim().toUpperCase()
    if (!inviteCode) {
      this.setData({ formError: copy.onboarding.codeRequired })
      return
    }
    this.setData({ submitting: true, formError: '' })
    try {
      const family = await callFamily('join', { inviteCode })
      setAppFamily(family)
      wx.reLaunch({ url: '/pages/items/index' })
    } catch (e) {
      let msg = e.message || '加入失败'
      if (e.code === 'ALREADY_IN_FAMILY') msg = copy.onboarding.alreadyIn
      if (e.code === 'INVALID_CODE') msg = copy.onboarding.invalidCode
      this.setData({ formError: msg })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
