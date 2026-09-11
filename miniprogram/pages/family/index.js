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
    familyMeta: '',
    families: [],
    acting: false,
    panel: '',
    familyNameInput: '',
    inviteCode: '',
    formError: '',
    gradients: GRADIENT_PRESETS,
    solids: SOLID_PRESETS,
    theme: null,
    headerTitle: ''
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [family, listed] = await Promise.all([
        callFamily('getMyFamily'),
        callFamily('listMyFamilies')
      ])
      const theme = setAppFamily(family)
      this.setData({
        family,
        familyMeta: copy.family.meta(family.memberCount || 0),
        families: listed.list || [],
        loading: false,
        panel: '',
        formError: '',
        theme,
        headerTitle: ''
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

  async onToggleExpireReminder() {
    if (this.data.acting || !this.data.family) return
    const current =
      this.data.family.expireReminderEnabled === undefined
        ? true
        : !!this.data.family.expireReminderEnabled
    const next = !current
    this.setData({ acting: true })
    try {
      const family = await callFamily('updateExpireReminder', { enabled: next })
      setAppFamily(family)
      this.setData({
        family,
        acting: false
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
      setAppFamily(family)
      wx.showToast({ title: '已切换', icon: 'success' })
      await this.load()
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
        familyMeta: copy.family.meta(family.memberCount || 0),
        theme,
        headerTitle: ''
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
        this.setData({ acting: false })
        await this.load()
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
