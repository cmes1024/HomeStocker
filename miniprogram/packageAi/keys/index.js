const { callAi } = require('../utils/callAi')
const { ensureSession } = require('../../utils/session')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.ai,
    common: copy.common,
    theme: null,
    headerTitle: copy.ai.keysTitle,
    loading: true,
    error: '',
    keys: [],
    apiKey: '',
    label: '',
    acting: false
  },

  onLoad() {
    bindThemeToPage(this, { headerTitle: copy.ai.keysTitle })
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: copy.ai.keysTitle })
    try {
      const session = await ensureSession()
      if (!session || !session.hasFamily) {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      setAppFamily(session.family)
      bindThemeToPage(this, { headerTitle: copy.ai.keysTitle })
      this.load()
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  async load() {
    this.setData(this.data.keys.length ? { error: '' } : { loading: true, error: '' })
    try {
      const data = await callAi('listKeys')
      this.setData({
        keys: (data && data.list) || [],
        loading: false,
        error: ''
      })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    this.load()
  },

  onKeyInput(e) {
    this.setData({ apiKey: e.detail.value || '' })
  },

  onLabelInput(e) {
    this.setData({ label: e.detail.value || '' })
  },

  async onAdd() {
    if (this.data.acting) return
    const apiKey = String(this.data.apiKey || '').trim()
    if (!apiKey) {
      wx.showToast({ title: copy.ai.keyRequired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callAi('addKey', {
        apiKey,
        label: String(this.data.label || '').trim()
      })
      this.setData({ apiKey: '', label: '', acting: false })
      wx.showToast({ title: '已添加', icon: 'success' })
      await this.load()
    } catch (e) {
      this.setData({ acting: false })
      const msg = e.code === 'KEY_LIMIT' ? copy.ai.maxKeys : e.message || copy.common.opFailed
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  async onSetDefault(e) {
    if (this.data.acting) return
    const keyId = e.currentTarget.dataset.id
    if (!keyId) return
    this.setData({ acting: true })
    try {
      await callAi('setDefaultKey', { keyId })
      this.setData({ acting: false })
      await this.load()
    } catch (err) {
      this.setData({ acting: false })
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    }
  },

  async onRemove(e) {
    if (this.data.acting) return
    const keyId = e.currentTarget.dataset.id
    if (!keyId) return
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.ai.removeKey,
        content: copy.ai.keysHint,
        confirmText: copy.ai.removeKey,
        confirmColor: '#FA5151',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return
    this.setData({ acting: true })
    try {
      await callAi('removeKey', { keyId })
      this.setData({ acting: false })
      await this.load()
    } catch (err) {
      this.setData({ acting: false })
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    }
  }
})
