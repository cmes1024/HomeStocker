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
    loadingColors: ['#C4A484', '#C4A484'],
    error: '',
    keys: [],
    hosted: null,
    presets: [],
    providerNames: [],
    providerIndex: 0,
    modelNames: [],
    modelIndex: 0,
    apiKey: '',
    label: '',
    acting: false,
    showAdd: false,
    faqItems: copy.ai.faqItems || [],
    openFaqId: ''
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
      const presets = (data && data.presets) || []
      const hadPresets = (this.data.presets || []).length > 0
      const providerIndex = Math.min(this.data.providerIndex || 0, Math.max(presets.length - 1, 0))
      const models = (presets[providerIndex] && presets[providerIndex].models) || []
      const defaultModel = models.findIndex((row) => row && row.isDefault)
      const modelIndex = hadPresets
        ? Math.min(this.data.modelIndex || 0, Math.max(models.length - 1, 0))
        : defaultModel >= 0
          ? defaultModel
          : 0
      this.setData({
        keys: (data && data.list) || [],
        hosted: this.presentHosted(data && data.hosted, ((data && data.list) || []).length > 0),
        presets,
        providerNames: presets.map((row) => row.label),
        providerIndex,
        modelNames: models.map((row) => row.label),
        modelIndex,
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

  onProviderChange(e) {
    const providerIndex = Number(e.detail.value) || 0
    const provider = this.data.presets[providerIndex]
    const models = (provider && provider.models) || []
    const defaultModel = models.findIndex((row) => row && row.isDefault)
    this.setData({
      providerIndex,
      modelNames: models.map((row) => row.label),
      modelIndex: defaultModel >= 0 ? defaultModel : 0
    })
  },

  onModelChange(e) {
    this.setData({ modelIndex: Number(e.detail.value) || 0 })
  },

  onKeyInput(e) {
    this.setData({ apiKey: e.detail.value || '' })
  },

  onLabelInput(e) {
    this.setData({ label: e.detail.value || '' })
  },

  onOpenAdd() {
    if (this.data.acting) return
    this.setData({ showAdd: true })
  },

  onCloseAdd() {
    if (this.data.acting) return
    this.setData({ showAdd: false, apiKey: '', label: '' })
  },

  onNoop() {},

  async onAdd() {
    if (this.data.acting) return
    const apiKey = String(this.data.apiKey || '').trim()
    const provider = this.data.presets[this.data.providerIndex]
    const model = provider && provider.models && provider.models[this.data.modelIndex]
    if (!provider || !model) {
      wx.showToast({ title: copy.common.loadFailed, icon: 'none' })
      return
    }
    if (!apiKey) {
      wx.showToast({ title: copy.ai.keyRequired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callAi('addKey', {
        apiKey,
        label: String(this.data.label || '').trim(),
        provider: provider.id,
        model: model.id
      })
      this.setData({ apiKey: '', label: '', acting: false, showAdd: false })
      wx.showToast({ title: '已添加', icon: 'success' })
      await this.load()
    } catch (e) {
      this.setData({ acting: false })
      const msg = e.code === 'KEY_LIMIT' ? copy.ai.maxKeys : e.message || copy.common.opFailed
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  presentHosted(hosted, hasKeys) {
    if (!hosted || !hosted.expiresAt) return null
    const ymd = this.formatYmd(hosted.expiresAt)
    const expired = !hosted.active
    const active = !!hosted.active && !expired
    return {
      active,
      expired,
      expiresAt: hosted.expiresAt,
      defaulted: active && (!!hosted.isDefault || !hasKeys),
      hint: expired ? copy.ai.hostedEnded(ymd) : copy.ai.hostedUntil(ymd)
    }
  },

  formatYmd(ms) {
    const n = Number(ms)
    if (!Number.isFinite(n) || n <= 0) return ''
    const d = new Date(n)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  async onSetHostedDefault() {
    if (this.data.acting) return
    if (!this.data.hosted || !this.data.hosted.active) {
      wx.showToast({ title: copy.ai.hostedExpired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callAi('setHostedDefault', {})
      this.setData({ acting: false })
      await this.load()
    } catch (err) {
      this.setData({ acting: false })
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
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
      const keys = (this.data.keys || []).filter((row) => row && row._id !== keyId)
      const prev = this.data.hosted
      this.setData({
        acting: false,
        keys,
        hosted: prev
          ? Object.assign({}, prev, {
              defaulted: keys.length === 0 ? !!prev.active : prev.defaulted
            })
          : null
      })
      await this.load()
    } catch (err) {
      this.setData({ acting: false })
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    }
  },

  onToggleFaq(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({
      openFaqId: this.data.openFaqId === id ? '' : id
    })
  },

  onCopyDeepseekLink() {
    const provider = this.data.presets[this.data.providerIndex]
    const url =
      (provider && provider.consoleUrl) ||
      copy.ai.deepseekPlatformUrl ||
      'https://platform.deepseek.com/api_keys'
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: copy.ai.faqCopied, icon: 'success' })
      }
    })
  }
})
