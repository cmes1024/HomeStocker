const { callModule } = require('../../utils/javaApi')
const { ensureSession } = require('../../utils/session')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const copy = require('../../utils/copy')
const { VOICES } = require('../utils/voices')

/** 界面上不摆渠道标识；默认音色没有中文名，给个能读的称呼 */
const VOICE_LABELS = VOICES.map((v) => (v === 'mimo_default' ? '默认音色' : v))

Page({
  data: {
    theme: null,
    loadingColors: [],
    common: copy.common,
    loading: true,
    saving: false,
    model: '',
    modelLabel: '',
    keys: [],
    keyId: '',
    voices: VOICES,
    voiceLabels: VOICE_LABELS,
    voiceIndex: 0,
    available: false,
    source: 'none',
    effective: null,
    error: '',
    /** 只有首次读取失败才整页切错误态；保存失败留在页内提示 */
    loadFailed: false
  },

  onShow() {
    bindThemeToPage(this)
    this.prepare()
  },

  async prepare() {
    try {
      const session = await ensureSession()
      if (!session || !session.hasFamily) {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      setAppFamily(session.family)
      bindThemeToPage(this)
      this.load()
    } catch (e) {
      this.setData({
        loading: false,
        loadFailed: true,
        error: (e && e.message) || copy.common.loadFailed
      })
    }
  },

  async load() {
    try {
      const res = (await callModule('voice', 'settings/get')) || {}
      const savedVoice = res.voice || ''
      const savedIndex = VOICES.indexOf(savedVoice)
      this.setData({
        loading: false,
        loadFailed: false,
        model: res.model || '',
        modelLabel: res.modelLabel || res.model || '',
        keys: res.keys || [],
        keyId: res.keyId || '',
        voiceIndex: savedIndex >= 0 ? savedIndex : 0,
        available: !!res.available,
        source: res.source || 'none',
        effective: res.effective || null,
        error: ''
      })
    } catch (e) {
      this.setData({
        loading: false,
        loadFailed: true,
        error: (e && e.message) || '读取设置失败'
      })
    }
  },

  onRetry() {
    this.setData({ loading: true, error: '', loadFailed: false })
    this.load()
  },

  onPickKey(e) {
    this.setData({ keyId: e.currentTarget.dataset.id || '' })
  },

  onVoiceChange(e) {
    this.setData({ voiceIndex: Number(e.detail.value) || 0 })
  },

  async onSave() {
    if (this.data.saving) return
    const voice = this.data.voices[this.data.voiceIndex] || ''
    this.setData({ saving: true, error: '' })
    try {
      const res =
        (await callModule('voice', 'settings/save', {
          model: this.data.model,
          voice,
          keyId: this.data.keyId
        })) || {}
      this.setData({
        saving: false,
        available: !!res.available,
        source: res.source || 'none',
        effective: res.effective || null
      })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      this.setData({ saving: false, error: (e && e.message) || '保存失败' })
    }
  }
})
