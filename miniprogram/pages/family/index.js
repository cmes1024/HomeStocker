const { callFamily } = require('../../utils/cloud')
const {
  GRADIENT_PRESETS,
  SOLID_PRESETS,
  setAppFamily,
  bindThemeToPage
} = require('../../utils/theme')
const { compressImageForUpload } = require('../../utils/imageCompress')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.family,
    common: copy.common,
    loading: true,
    error: '',
    family: null,
    families: [],
    acting: false,
    panel: '',
    familyNameInput: '',
    inviteCode: '',
    formError: '',
    gradients: GRADIENT_PRESETS,
    solids: SOLID_PRESETS,
    theme: null,
    headerTitle: '',
    moodSheet: false
  },

  onShow() {
    const app = getApp()
    const cached = app && app.globalData && app.globalData.family
    const name = (cached && cached.name) || this.data.headerTitle || ''
    bindThemeToPage(this, name ? { headerTitle: name } : {})
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
        panel: '',
        formError: '',
        theme,
        headerTitle: family.name || '家庭'
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
      headerTitle: family.name || '家庭',
      loading: false,
      panel: '',
      formError: ''
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

  openMoodSheet() {
    this.setData({ moodSheet: true, panel: '', formError: '' })
  },

  closeMoodSheet() {
    if (!this.data.moodSheet) return
    this.setData({ moodSheet: false })
  },

  onReminderTap() {
    if (this.data.acting || !this.data.family) return
    const enabled = this.data.family.expireReminderEnabled !== false
    wx.showActionSheet({
      itemList: [
        enabled ? copy.family.reminderTurnOff : copy.family.reminderTurnOn,
        copy.family.reminderRunNow
      ],
      success: (res) => {
        if (res.tapIndex === 0) this.applyExpireReminder(!enabled)
        if (res.tapIndex === 1) this.onRunExpireNotify()
      }
    })
  },

  async applyExpireReminder(next) {
    if (this.data.acting || !this.data.family) return
    this.setData({ acting: true })
    try {
      const family = await callFamily('updateExpireReminder', { enabled: next })
      setAppFamily(family)
      this.setData({
        family,
        acting: false
      })
      wx.showToast({
        title: next ? copy.family.reminderOn : copy.family.reminderOff,
        icon: 'none'
      })
    } catch (e) {
      this.setData({ acting: false })
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    }
  },

  async onRunExpireNotify() {
    if (this.data.acting) return
    this.setData({ acting: true })
    wx.showLoading({ title: copy.family.reminderRunning, mask: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'expireNotify', data: {} })
      const result = (res && res.result) || {}
      const data = result.data || {}
      wx.hideLoading()
      if (data.failCount > 0) {
        wx.showModal({
          title: copy.family.reminderRunFail,
          content: data.lastError || copy.common.opFailed,
          showCancel: false
        })
      } else if (!data.sendAttempts) {
        wx.showToast({
          title: data.candidateCount
            ? '有临期物品但无人授权'
            : '当前无匹配的临期物品',
          icon: 'none'
        })
      } else {
        wx.showToast({ title: copy.family.reminderRunOk, icon: 'success' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  openPanel(e) {
    const panel = e.currentTarget.dataset.panel || ''
    if (this.data.panel === panel) {
      this.setData({ panel: '', formError: '' })
      return
    }
    this.setData({
      panel,
      formError: '',
      familyNameInput: '',
      inviteCode: ''
    })
  },

  closePanel() {
    this.setData({ panel: '', formError: '' })
  },

  onNameInput(e) {
    this.setData({ familyNameInput: e.detail.value })
  },

  onCodeInput(e) {
    this.setData({ inviteCode: (e.detail.value || '').toUpperCase() })
  },

  async onCreate() {
    if (this.data.acting) return
    const name = (this.data.familyNameInput || '').trim()
    if (!name) {
      this.setData({ formError: copy.family.nameRequired })
      return
    }
    this.setData({ acting: true, formError: '' })
    try {
      const family = await callFamily('create', { name })
      setAppFamily(family)
      wx.showToast({ title: '已创建', icon: 'success' })
      await this.load()
    } catch (e) {
      this.setData({ formError: e.message || '创建失败' })
    } finally {
      this.setData({ acting: false })
    }
  },

  async onJoin() {
    if (this.data.acting) return
    const inviteCode = (this.data.inviteCode || '').trim().toUpperCase()
    if (!inviteCode) {
      this.setData({ formError: copy.family.codeRequired })
      return
    }
    this.setData({ acting: true, formError: '' })
    try {
      const family = await callFamily('join', { inviteCode })
      setAppFamily(family)
      wx.showToast({ title: '已加入', icon: 'success' })
      await this.load()
    } catch (e) {
      let msg = e.message || '加入失败'
      if (e.code === 'ALREADY_IN_FAMILY') msg = copy.family.alreadyIn
      if (e.code === 'INVALID_CODE') msg = copy.family.invalidCode
      this.setData({ formError: msg })
    } finally {
      this.setData({ acting: false })
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
        headerTitle: family.name || '家庭'
      })
      wx.showToast({ title: '已更新背景', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '设置失败', icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  onPickGradient(e) {
    if (this.data.acting) return
    const value = e.currentTarget.dataset.value
    if (!value) return
    this.applyBackground('gradient', value)
  },

  onPickSolid(e) {
    if (this.data.acting) return
    const value = e.currentTarget.dataset.value
    if (!value) return
    this.applyBackground('solid', value)
  },

  async onPickImage() {
    if (this.data.acting) return
    try {
      const choose = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })
      const file = choose.tempFiles && choose.tempFiles[0]
      if (!file || !file.tempFilePath) return

      this.setData({ acting: true })
      wx.showLoading({ title: '上传中', mask: true })
      const filePath = await compressImageForUpload(file.tempFilePath, {
        maxEdge: 1600,
        quality: 72
      })
      const ext = (filePath.match(/\.\w+$/) || ['.jpg'])[0]
      const cloudPath = `family-bg/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      const upload = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
      wx.hideLoading()
      if (!upload.fileID) {
        throw new Error(copy.family.uploadFailed)
      }
      this.setData({ acting: false })
      await this.applyBackground('image', upload.fileID)
    } catch (e) {
      wx.hideLoading()
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      wx.showToast({ title: (e && e.message) || copy.family.uploadFailed, icon: 'none' })
      this.setData({ acting: false })
    }
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
