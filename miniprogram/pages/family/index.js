const { callFamily } = require('../../utils/cloud')
const {
  THEME_PRESETS,
  setAppFamily,
  bindThemeToPage,
  getAppTheme
} = require('../../utils/theme')
const copy = require('../../utils/copy')

const KEY_SVG_PATH = '/assets/key.svg'
let keySvgText = ''

function keyIconSrc(color) {
  if (!keySvgText) {
    try {
      keySvgText = wx.getFileSystemManager().readFileSync(KEY_SVG_PATH, 'utf8')
    } catch (e) {
      return KEY_SVG_PATH
    }
  }
  const fill = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(color || ''))
    ? color
    : '#FF5D00'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    keySvgText.replace(/fill="#[0-9A-Fa-f]+"/g, `fill="${fill}"`)
  )}`
}

Page({
  data: {
    copy: copy.family,
    common: copy.common,
    loading: true,
    error: '',
    family: null,
    families: [],
    acting: false,
    showModal: false,
    modalMode: 'create',
    modalTitle: copy.family.createModalTitle,
    modalPlaceholder: copy.family.createNamePlaceholder,
    modalValue: '',
    modalMaxlength: 20,
    modalConfirm: copy.family.createSubmit,
    modalError: '',
    themes: THEME_PRESETS,
    theme: null,
    headerTitle: '',
    moodSheet: false,
    reminderEnabled: true,
    keyIcon: ''
  },

  onShow() {
    const app = getApp()
    const cached = app && app.globalData && app.globalData.family
    const name = (cached && cached.name) || this.data.headerTitle || ''
    const theme = getAppTheme()
    bindThemeToPage(this, {
      ...(name ? { headerTitle: name } : {}),
      keyIcon: keyIconSrc(theme.primary)
    })
    // 从空间/标签/消息返回时页面实例还在，家庭列表没变，不再打 getMyFamily / listMyFamilies
    if (!this.data.family) this.load()
  },

  onShareAppMessage() {
    const family = this.data.family
    const code = family && family.inviteCode
    if (code) {
      return {
        title: copy.family.inviteShareTitle(family.name || '家庭'),
        path: `/pages/onboarding/index?inviteCode=${code}`
      }
    }
    return {
      title: '家庭物资',
      path: '/pages/items/index'
    }
  },

  async load() {
    this.setData(this.data.family ? { error: '' } : { loading: true, error: '' })
    try {
      const [family, listed] = await Promise.all([
        callFamily('getMyFamily'),
        callFamily('listMyFamilies')
      ])
      const theme = setAppFamily(family)
      this.setData({
        family,
        families: listed.list || [],
        loading: false,
        theme,
        keyIcon: keyIconSrc(theme.primary),
        headerTitle: family.name || '家庭',
        reminderEnabled: family.expireReminderEnabled !== false
      })
    } catch (e) {
      if (e.code === 'NO_FAMILY') {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    this.load()
  },

  applyCurrentFamily(family, families) {
    const theme = setAppFamily(family)
    const source = families || this.data.families || []
    this.setData({
      family,
      families: source.map((item) => {
        const current = item._id === family._id
        return {
          ...(current ? { ...item, ...family } : item),
          isCurrent: current
        }
      }),
      theme,
      keyIcon: keyIconSrc(theme.primary),
      headerTitle: family.name || '家庭',
      loading: false,
      reminderEnabled: family.expireReminderEnabled !== false
    })
  },

  onCopyCode() {
    const code = this.data.family && this.data.family.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: copy.family.inviteCopied, icon: 'success' })
    })
  },

  goSpaces() {
    wx.navigateTo({ url: '/packageBrowse/spaces/index' })
  },

  goTags() {
    wx.navigateTo({ url: '/pages/family/tags' })
  },

  goMessages() {
    wx.navigateTo({ url: '/pages/family/messages' })
  },

  goAiKeys() {
    wx.navigateTo({
      url: '/packageAi/keys/index',
      fail: () => wx.showToast({ title: copy.ai.fabFail, icon: 'none' })
    })
  },

  openMoodSheet() {
    this.setData({ moodSheet: true })
  },

  closeMoodSheet() {
    if (!this.data.moodSheet) return
    this.setData({ moodSheet: false })
  },

  onTogglePush(e) {
    const next = !!(e.detail && e.detail.value)
    this.applyExpireReminder(next)
  },

  async applyExpireReminder(next) {
    const current = this.data.family && this.data.family.expireReminderEnabled !== false
    if (this.data.acting || !this.data.family) {
      this.setData({ reminderEnabled: !!current })
      return
    }
    if (next === current) return
    this.setData({ acting: true, reminderEnabled: next })
    try {
      const family = await callFamily('updateExpireReminder', { enabled: next })
      setAppFamily(family)
      this.setData({
        family,
        acting: false,
        reminderEnabled: family.expireReminderEnabled !== false
      })
      wx.showToast({
        title: next ? copy.family.reminderOn : copy.family.reminderOff,
        icon: 'none'
      })
    } catch (e) {
      this.setData({
        acting: false,
        reminderEnabled: current
      })
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    }
  },

  openModal(e) {
    if (this.data.acting) return
    const mode = e.currentTarget.dataset.mode === 'join' ? 'join' : 'create'
    const isJoin = mode === 'join'
    this.setData({
      showModal: true,
      modalMode: mode,
      modalTitle: isJoin ? copy.family.joinModalTitle : copy.family.createModalTitle,
      modalPlaceholder: isJoin
        ? copy.family.joinCodePlaceholder
        : copy.family.createNamePlaceholder,
      modalValue: '',
      modalMaxlength: isJoin ? 6 : 20,
      modalConfirm: isJoin ? copy.family.joinSubmit : copy.family.createSubmit,
      modalError: ''
    })
  },

  closeModal() {
    if (this.data.acting) return
    this.setData({
      showModal: false,
      modalValue: '',
      modalError: ''
    })
  },

  onModalInput(e) {
    let value = e.detail.value || ''
    if (this.data.modalMode === 'join') value = value.toUpperCase()
    this.setData({ modalValue: value, modalError: '' })
  },

  async onSaveModal() {
    if (this.data.modalMode === 'join') return this.onJoin()
    return this.onCreate()
  },

  async onCreate() {
    if (this.data.acting) return
    const name = (this.data.modalValue || '').trim()
    if (!name) {
      this.setData({ modalError: copy.family.nameRequired })
      return
    }
    this.setData({ acting: true, modalError: '' })
    try {
      const family = await callFamily('create', { name })
      setAppFamily(family)
      this.setData({ showModal: false, modalValue: '', acting: false })
      wx.showToast({ title: '已创建', icon: 'success' })
      await this.load()
    } catch (e) {
      this.setData({ acting: false, modalError: e.message || '创建失败' })
    }
  },

  async onJoin() {
    if (this.data.acting) return
    const inviteCode = (this.data.modalValue || '').trim().toUpperCase()
    if (!inviteCode) {
      this.setData({ modalError: copy.family.codeRequired })
      return
    }
    this.setData({ acting: true, modalError: '' })
    try {
      const family = await callFamily('join', { inviteCode })
      setAppFamily(family)
      this.setData({ showModal: false, modalValue: '', acting: false })
      wx.showToast({ title: '已加入', icon: 'success' })
      await this.load()
    } catch (e) {
      let msg = e.message || '加入失败'
      if (e.code === 'ALREADY_IN_FAMILY') msg = copy.family.alreadyIn
      if (e.code === 'INVALID_CODE') msg = copy.family.invalidCode
      this.setData({ acting: false, modalError: msg })
    }
  },

  async onSwitchFamily(e) {
    if (this.data.acting) return
    const familyId = e.currentTarget.dataset.id
    if (!familyId || (this.data.family && familyId === this.data.family._id)) return
    this.setData({ acting: true })
    try {
      const family = await callFamily('switchFamily', { familyId })
      this.applyCurrentFamily(family)
      wx.showToast({ title: '已切换', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '切换失败', icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  async applyBackground(type, value) {
    this.setData({ acting: true })
    try {
      const family = await callFamily('updateBackground', { type, value })
      const theme = setAppFamily(family)
      this.setData({
        family,
        theme,
        keyIcon: keyIconSrc(theme.primary),
        headerTitle: family.name || '家庭'
      })
      wx.showToast({ title: '已更新氛围', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '设置失败', icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  onPickTheme(e) {
    if (this.data.acting) return
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.applyBackground('theme', id)
  },

  async onLeave() {
    if (this.data.acting) return
    const family = this.data.family
    if (!family) return

    const isOwner = family.isOwner
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: isOwner ? copy.family.dissolveTitle : copy.family.leaveTitle,
        content: isOwner ? copy.family.dissolveContent : copy.family.leaveContent,
        confirmText: isOwner ? copy.family.dissolveConfirm : copy.family.leaveConfirm,
        confirmColor: '#FA5151',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return

    this.setData({ acting: true })
    try {
      const result = await callFamily('leave')
      if (result && result.nextFamilyId) {
        wx.showToast({
          title: isOwner ? copy.family.dissolvedToast : copy.family.leftToast,
          icon: 'success'
        })
        const rest = (this.data.families || []).filter((item) => item._id !== family._id)
        const next = rest.find((item) => item._id === result.nextFamilyId)
        this.setData({ acting: false })
        if (next) this.applyCurrentFamily(next, rest)
        else await this.load()
      } else {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
      }
    } catch (e) {
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
      this.setData({ acting: false })
    }
  }
})
