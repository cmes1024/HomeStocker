const { callFamily } = require('../../utils/cloud')
const {
  THEME_PRESETS,
  setAppFamily,
  bindThemeToPage,
  getAppTheme
} = require('../../utils/theme')
const { getStorage, setStorage } = require('../../utils/storage')
const copy = require('../../utils/copy')

const KEY_SVG_PATH = '/assets/key.svg'
const CODE_VISIBLE_KEY = 'familyInviteCodeVisible'
let keySvgText = ''

const EDIT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
const EYE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'

function tintSvg(svg, color) {
  const fill = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color || ''))
    ? color
    : '#FF5D00'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.split('#000').join(fill)
  )}`
}

function editIconSrc(theme) {
  const color = (theme && (theme.themeColor || theme.primary)) || '#FF5D00'
  return tintSvg(EDIT_SVG, color)
}

function eyeIcons(theme) {
  const color = (theme && (theme.themeColor || theme.primary)) || '#FF5D00'
  return {
    eyeOpenIcon: tintSvg(EYE_SVG, color),
    eyeOffIcon: tintSvg(EYE_OFF_SVG, color)
  }
}

function readCodeVisible() {
  return getStorage(CODE_VISIBLE_KEY) === true
}

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
    loadingColors: ['#C4A484', '#C4A484'],
    switching: false,
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
    editingFamilyId: '',
    themes: THEME_PRESETS,
    theme: null,
    headerTitle: '',
    moodSheet: false,
    reminderEnabled: true,
    keyIcon: '',
    editIcon: '',
    eyeOpenIcon: '',
    eyeOffIcon: '',
    codeVisible: false,
    codeDisplay: ''
  },

  onShow() {
    const app = getApp()
    const cached = app && app.globalData && app.globalData.family
    const name = (cached && cached.name) || this.data.headerTitle || ''
    const theme = getAppTheme()
    const codeVisible = readCodeVisible()
    bindThemeToPage(this, {
      ...(name ? { headerTitle: name } : {}),
      keyIcon: keyIconSrc(theme.primary),
      editIcon: editIconSrc(theme),
      ...eyeIcons(theme),
      codeVisible,
      codeDisplay: this.formatInviteCode(
        cached && cached.inviteCode,
        codeVisible
      )
    })
    // 从空间/标签/消息返回时页面实例还在，家庭列表没变，不再打 getMyFamily / listMyFamilies
    if (!this.data.family) this.load()
  },

  formatInviteCode(code, visible) {
    const raw = String(code || '')
    if (!raw) return ''
    return visible ? raw : '••••••'
  },

  syncCodeDisplay(family, codeVisible) {
    const visible = codeVisible === undefined ? this.data.codeVisible : !!codeVisible
    const code = (family && family.inviteCode) || (this.data.family && this.data.family.inviteCode)
    return {
      codeVisible: visible,
      codeDisplay: this.formatInviteCode(code, visible)
    }
  },

  onShareAppMessage() {
    const family = this.data.family
    const code = family && family.inviteCode
    if (code) {
      return {
        title: copy.family.inviteShareTitle(family.name || '家庭'),
        path: `/pages/onboarding/index?inviteCode=${code}`,
        imageUrl: '/assets/shared.png'
      }
    }
    return {
      title: '家庭物资',
      path: '/pages/items/index',
      imageUrl: '/assets/shared.png'
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
      const codeVisible = readCodeVisible()
      this.setData({
        family,
        families: listed.list || [],
        loading: false,
        theme,
        keyIcon: keyIconSrc(theme.primary),
        editIcon: editIconSrc(theme),
        ...eyeIcons(theme),
        ...this.syncCodeDisplay(family, codeVisible),
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
      editIcon: editIconSrc(theme),
      ...eyeIcons(theme),
      ...this.syncCodeDisplay(family),
      headerTitle: family.name || '家庭',
      loading: false,
      reminderEnabled: family.expireReminderEnabled !== false
    })
  },

  onToggleCodeVisible() {
    const next = !this.data.codeVisible
    setStorage(CODE_VISIBLE_KEY, next)
    this.setData(this.syncCodeDisplay(this.data.family, next))
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
      editingFamilyId: '',
      modalError: ''
    })
  },

  openRename(e) {
    if (this.data.acting) return
    const id = e.currentTarget.dataset.id || ''
    const name = e.currentTarget.dataset.name || ''
    if (!id) return
    this.setData({
      showModal: true,
      modalMode: 'rename',
      modalTitle: copy.family.renameTitle,
      modalPlaceholder: copy.family.renamePlaceholder,
      modalValue: name,
      modalMaxlength: 20,
      modalConfirm: copy.family.renameSubmit,
      editingFamilyId: id,
      modalError: ''
    })
  },

  closeModal() {
    if (this.data.acting) return
    this.setData({
      showModal: false,
      modalValue: '',
      editingFamilyId: '',
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
    if (this.data.modalMode === 'rename') return this.onRename()
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

  async onRename() {
    if (this.data.acting) return
    const name = (this.data.modalValue || '').trim()
    const familyId = this.data.editingFamilyId
    if (!name) {
      this.setData({ modalError: copy.family.nameRequired })
      return
    }
    if (!familyId) {
      this.setData({ modalError: copy.common.opFailed })
      return
    }
    this.setData({ acting: true, modalError: '' })
    try {
      const updated = await callFamily('updateName', { familyId, name })
      const isCurrent = this.data.family && this.data.family._id === familyId
      const families = (this.data.families || []).map((item) =>
        item._id === familyId ? { ...item, name: updated.name } : item
      )
      const patch = {
        families,
        showModal: false,
        modalValue: '',
        editingFamilyId: '',
        acting: false
      }
      if (isCurrent) {
        const family = { ...this.data.family, name: updated.name }
        setAppFamily(family)
        patch.family = family
        patch.headerTitle = family.name || '家庭'
      }
      this.setData(patch)
      wx.showToast({ title: copy.family.renamedToast, icon: 'success' })
    } catch (e) {
      this.setData({ acting: false, modalError: e.message || copy.common.opFailed })
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
    if (this.data.acting || this.data.switching) return
    const familyId = e.currentTarget.dataset.id
    if (!familyId || (this.data.family && familyId === this.data.family._id)) return
    this.setData({ acting: true, switching: true })
    try {
      const family = await callFamily('switchFamily', { familyId })
      this.applyCurrentFamily(family)
      this.setData({ acting: false, switching: false })
      wx.showToast({ title: '已切换', icon: 'success' })
    } catch (err) {
      this.setData({ acting: false, switching: false })
      wx.showToast({ title: err.message || '切换失败', icon: 'none' })
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
        editIcon: editIconSrc(theme),
        ...eyeIcons(theme),
        ...this.syncCodeDisplay(family),
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
