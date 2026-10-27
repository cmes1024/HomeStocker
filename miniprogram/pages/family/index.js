const { callFamily, invalidateFamilyReads } = require('../../utils/cloud')
const javaApi = require('../../utils/javaApi')
const { uploadEntityImage } = require('../../utils/cloudImage')
const {
  THEME_PRESETS,
  setAppFamily,
  bindThemeToPage,
  getAppTheme
} = require('../../utils/theme')
const { getStorage, setStorage } = require('../../utils/storage')
const copy = require('../../utils/copy')
const { appName, share } = require('../../config/index')

const KEY_SVG_PATH = '/assets/key.svg'
const EDIT_SVG_PATH = '/assets/edit.svg'
const AI_SVG_PATH = '/assets/ai.svg'
const VIP_SVG_PATH = '/assets/vip.svg'
const CODE_VISIBLE_KEY = 'familyInviteCodeVisible'

const svgCache = {
  key: '',
  edit: '',
  ai: '',
  vip: ''
}

const EYE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'

function themeColor(themeOrColor) {
  if (typeof themeOrColor === 'string') {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(themeOrColor)
      ? themeOrColor
      : '#FF5D00'
  }
  const color =
    (themeOrColor && (themeOrColor.themeColor || themeOrColor.primary)) || '#FF5D00'
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(color))
    ? color
    : '#FF5D00'
}

/** 解析后端下发的整数字段；非法或越界时回落到默认值，避免脏数据渲染成怪时间。 */
function pickInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const v = Math.round(n)
  return v >= min && v <= max ? v : fallback
}

function formatHm(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function tintSvg(svg, color) {
  const fill = themeColor(color)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.split('#000').join(fill)
  )}`
}

function readAssetSvg(path, cacheKey) {
  if (svgCache[cacheKey]) return svgCache[cacheKey]
  try {
    svgCache[cacheKey] = wx.getFileSystemManager().readFileSync(path, 'utf8')
    return svgCache[cacheKey]
  } catch (e) {
    return ''
  }
}

/** assets 里的功能图标：替换 fill 色以跟随主题 */
function themedAssetIcon(path, cacheKey, themeOrColor) {
  const raw = readAssetSvg(path, cacheKey)
  if (!raw) return path
  const fill = themeColor(themeOrColor)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    raw.replace(/fill="#[0-9A-Fa-f]+"/g, `fill="${fill}"`)
  )}`
}

function actionIcons(theme) {
  return {
    editIcon: themedAssetIcon(EDIT_SVG_PATH, 'edit', theme),
    aiIcon: themedAssetIcon(AI_SVG_PATH, 'ai', theme),
    vipIcon: themedAssetIcon(VIP_SVG_PATH, 'vip', theme)
  }
}

function eyeIcons(theme) {
  const color = themeColor(theme)
  return {
    eyeOpenIcon: tintSvg(EYE_SVG, color),
    eyeOffIcon: tintSvg(EYE_OFF_SVG, color)
  }
}

function readCodeVisible() {
  return getStorage(CODE_VISIBLE_KEY) === true
}

function keyIconSrc(color) {
  return themedAssetIcon(KEY_SVG_PATH, 'key', color)
}

function displayName(member, fallback) {
  const nick = member && member.nickname ? String(member.nickname).trim() : ''
  if (nick) return nick
  if (member && member.isMe) return copy.family.meBadge
  return fallback || copy.messages.actorFallback
}

function initialOf(name) {
  const s = String(name || '').trim()
  if (!s) return '家'
  return s.slice(0, 1)
}

function mapMembers(list) {
  return (list || []).map((m) => {
    const name = displayName(m, copy.messages.actorFallback)
    return {
      ...m,
      displayName: name,
      initial: initialOf(m.nickname || (m.isMe ? '我' : '家'))
    }
  })
}

function profileView(profile) {
  const nickname = (profile && profile.nickname && String(profile.nickname).trim()) || ''
  const avatarUrl = (profile && profile.avatarUrl && String(profile.avatarUrl).trim()) || ''
  return {
    profile: { nickname, avatarUrl },
    profileDisplayName: nickname || copy.family.profileUnset,
    profileInitial: initialOf(nickname || '我')
  }
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
    members: [],
    profile: { nickname: '', avatarUrl: '' },
    profileDisplayName: copy.family.profileUnset,
    profileInitial: '我',
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
    sheetKind: '',
    sheetShow: false,
    sheetHeight: '56vh',
    profileDraftNickname: '',
    profileDraftAvatar: '',
    profileDraftInitial: '家',
    profilePendingPath: '',
    reminderButtonText: '',
    reminderDraft: { enabled: true, days: 3, hour: 8, minute: 0 },
    reminderTime: '08:00',
    reminderDayOptions: copy.family.reminderDayOptions,
    keyIcon: '',
    editIcon: '',
    aiIcon: '',
    vipIcon: '',
    eyeOpenIcon: '',
    eyeOffIcon: '',
    codeVisible: false,
    codeDisplay: '',
    capacityStatusText: '',
    capacityProgressText: '',
    capacityActive: false,
    showIssueForm: false,
    issueCount: '1',
    issueDurationAmount: '3',
    issueDurationUnit: 'month',
    issueHostedModel: false,
    issueFormError: '',
    issuedCodes: [],
    issuedDays: 0,
    issuedDaysText: '',
    issuedHosted: false,
    showPlatformPanel: false,
    platformKeys: [],
    platformPresets: [],
    platformProviderNames: [],
    platformProviderIndex: 0,
    platformModelNames: [],
    platformModelIndex: 0,
    platformApiKey: '',
    platformLabel: '',
    platformError: ''
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
      ...actionIcons(theme),
      ...eyeIcons(theme),
      codeVisible,
      codeDisplay: this.formatInviteCode(
        cached && cached.inviteCode,
        codeVisible
      )
    })
    // 旧缓存没有 isAdmin 时清 family 读缓存；已有 isAdmin（如清单 bootstrap）不必整表丢掉
    if (cached && typeof cached.isAdmin !== 'boolean') {
      invalidateFamilyReads()
    }
    // 每次进入都走 load（经 callFamily，短 TTL 内可命中）；避免前台驻留时家庭资料一直脏
    this.load()
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

  formatExpireYmd(ms) {
    const n = Number(ms)
    if (!Number.isFinite(n) || n <= 0) return ''
    const d = new Date(n)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  buildCapacityTexts(family) {
    const ent = (family && family.entitlement) || {}
    const itemCount = family && family.itemCount
    const memberCount = family && family.memberCount
    const active = !!(ent.active && ent.expiresAt)
    let capacityStatusText = copy.family.capacityInactive
    if (active) {
      const ymd = this.formatExpireYmd(ent.expiresAt)
      capacityStatusText = ymd
        ? copy.family.capacityActive(ymd)
        : copy.family.capacityInactive
    }
    return {
      capacityActive: active && capacityStatusText !== copy.family.capacityInactive,
      capacityStatusText,
      capacityProgressText: copy.family.capacityProgress(
        itemCount,
        ent.itemLimit,
        memberCount,
        ent.memberLimit
      )
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
      title: appName,
      path: share.path,
      imageUrl: share.imageUrl
    }
  },

  async load() {
    this.setData(this.data.family ? { error: '' } : { loading: true, error: '' })
    try {
      let family
      let families
      let members
      let profile

      try {
        const page = await callFamily('page')
        family = page.family
        if (!family || !family._id) {
          const err = new Error('尚未加入家庭')
          err.code = 'NO_FAMILY'
          throw err
        }
        families = page.list || []
        members = mapMembers(page.members || [])
        profile = page.profile || { nickname: '', avatarUrl: '' }
      } catch (e) {
        if (e && e.code === 'NO_FAMILY') throw e
        // 未部署 family.page 时降级
        const [listed, membersRes] = await Promise.all([
          callFamily('listMyFamilies'),
          callFamily('listMembers').catch(() => ({ list: [], profile: null }))
        ])
        family = await this.currentFamilyFromList(listed)
        families = listed.list || []
        members = mapMembers((membersRes && membersRes.list) || [])
        profile =
          (membersRes && membersRes.profile) ||
          (listed && listed.profile) ||
          { nickname: '', avatarUrl: '' }
      }

      const theme = setAppFamily(family)
      const codeVisible = readCodeVisible()
      this.setData({
        family,
        families,
        members,
        ...profileView(profile),
        loading: false,
        theme,
        keyIcon: keyIconSrc(theme.primary),
        ...actionIcons(theme),
        ...eyeIcons(theme),
        ...this.syncCodeDisplay(family, codeVisible),
        ...this.buildCapacityTexts(family),
        headerTitle: family.name || '家庭',
        ...this.reminderView(family)
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

  /**
   * 新云函数在 list 里带当前家庭（含容量）。未部署前没有 family 字段，退回 getMyFamily。
   */
  async currentFamilyFromList(listed) {
    if (listed && Object.prototype.hasOwnProperty.call(listed, 'family')) {
      if (listed.family && listed.family._id) return listed.family
      const err = new Error('尚未加入家庭')
      err.code = 'NO_FAMILY'
      throw err
    }
    return callFamily('getMyFamily')
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
      ...actionIcons(theme),
      ...eyeIcons(theme),
      ...this.syncCodeDisplay(family),
      ...this.buildCapacityTexts(family),
      headerTitle: family.name || '家庭',
      loading: false,
      ...this.reminderView(family)
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
      success: () => wx.showToast({ title: copy.family.inviteCopied, icon: 'none' })
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

  openMembersSheet() {
    this.openSheet('members')
  },

  openProfileSheet() {
    const profile = this.data.profile || { nickname: '', avatarUrl: '' }
    const nick = profile.nickname || ''
    this.setData({
      profileDraftNickname: nick,
      profileDraftAvatar: profile.avatarUrl || '',
      profileDraftInitial: initialOf(nick || '我'),
      profilePendingPath: '',
      sheetKind: 'profile',
      sheetShow: true,
      sheetHeight: '48vh'
    })
  },

  closeSheet() {
    if (!this.data.sheetShow) return
    if (
      this.data.acting &&
      (this.data.sheetKind === 'profile' || this.data.sheetKind === 'reminder')
    ) {
      return
    }
    this.setData({ sheetShow: false, sheetKind: '', profilePendingPath: '' })
  },

  openSheet(kind) {
    const heights = {
      mood: '56vh',
      members: '52vh',
      profile: '48vh',
      reminder: '60vh'
    }
    this.setData({
      sheetKind: kind,
      sheetShow: true,
      sheetHeight: heights[kind] || '52vh'
    })
  },

  onChooseAvatar(e) {
    const path = e && e.detail && e.detail.avatarUrl
    if (!path) return
    this.setData({
      profileDraftAvatar: path,
      profilePendingPath: path
    })
  },

  onProfileNickInput(e) {
    const nickname = (e.detail && e.detail.value) || ''
    this.setData({
      profileDraftNickname: nickname,
      profileDraftInitial: initialOf(nickname || '我')
    })
  },

  onProfileNickBlur(e) {
    const nickname = String((e.detail && e.detail.value) || '').trim()
    this.setData({
      profileDraftNickname: nickname,
      profileDraftInitial: initialOf(nickname || '我')
    })
  },

  async onSaveProfile() {
    if (this.data.acting) return
    const nickname = String(this.data.profileDraftNickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: copy.family.profileNickRequired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      let avatarFileID
      const pending = this.data.profilePendingPath
      if (pending) {
        avatarFileID = await uploadEntityImage(pending, 'avatar')
      }
      const payload = { nickname }
      if (avatarFileID) payload.avatarFileID = avatarFileID
      const profile = await callFamily('updateProfile', payload)
      const membersRes = await callFamily('listMembers')
      this.setData({
        acting: false,
        sheetShow: false,
        sheetKind: '',
        profilePendingPath: '',
        ...profileView(profile || { nickname, avatarUrl: avatarFileID || '' }),
        members: mapMembers((membersRes && membersRes.list) || [])
      })
      wx.showToast({ title: copy.family.profileSaved, icon: 'success' })
    } catch (e) {
      this.setData({ acting: false })
      wx.showToast({ title: e.message || copy.common.loadFailed, icon: 'none' })
    }
  },

  goAiKeys() {
    wx.navigateTo({
      url: '/packageAi/keys/index',
      fail: () => wx.showToast({ title: copy.ai.fabFail, icon: 'none' })
    })
  },

  openMoodSheet() {
    this.openSheet('mood')
  },

  reminderView(family) {
    const enabled = !!family && family.expireReminderEnabled !== false
    const hour = pickInt(family && family.expireReminderHour, 0, 23, 8)
    const minute = pickInt(family && family.expireReminderMinute, 0, 59, 0)
    return {
      reminderButtonText: copy.family.reminderButton(enabled, hour, minute)
    }
  },

  openReminderSheet() {
    if (this.data.acting || !this.data.family) return
    const family = this.data.family
    const days = copy.family.reminderDayOptions.some(
      (opt) => opt.value === family.expireReminderDays
    )
      ? family.expireReminderDays
      : 3
    const hour = pickInt(family.expireReminderHour, 0, 23, 8)
    const minute = pickInt(family.expireReminderMinute, 0, 59, 0)
    this.setData({
      reminderDraft: {
        enabled: family.expireReminderEnabled !== false,
        days,
        hour,
        minute
      },
      reminderTime: formatHm(hour, minute)
    })
    this.openSheet('reminder')
  },

  onReminderToggle(e) {
    this.setData({ 'reminderDraft.enabled': !!(e.detail && e.detail.value) })
  },

  onPickReminderDays(e) {
    if (!this.data.reminderDraft.enabled) return
    const days = Number(e.currentTarget.dataset.days)
    if (!Number.isFinite(days)) return
    this.setData({ 'reminderDraft.days': days })
  },

  onPickReminderTime(e) {
    if (!this.data.reminderDraft.enabled) return
    const [h, m] = String((e.detail && e.detail.value) || '').split(':')
    const hour = Number(h)
    const minute = Number(m)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return
    this.setData({
      reminderDraft: { ...this.data.reminderDraft, hour, minute },
      reminderTime: formatHm(hour, minute)
    })
  },

  /** 弹框内一次性保存：只发一次请求，避免边点边打接口。 */
  async saveReminder() {
    if (this.data.acting || !this.data.family) return
    const draft = this.data.reminderDraft
    this.setData({ acting: true })
    try {
      const family = await callFamily('updateExpireReminder', {
        enabled: !!draft.enabled,
        days: draft.days,
        hour: draft.hour,
        minute: draft.minute
      })
      setAppFamily(family)
      this.setData({
        family,
        acting: false,
        sheetShow: false,
        sheetKind: '',
        ...this.reminderView(family)
      })
      wx.showToast({ title: copy.family.reminderSaved, icon: 'none' })
    } catch (e) {
      this.setData({ acting: false })
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

  openIssueCodes() {
    if (this.data.acting) return
    if (!this.data.family || !this.data.family.isAdmin) return
    this.setData({
      showIssueForm: true,
      issueCount: '1',
      issueDurationAmount: '3',
      issueDurationUnit: 'month',
      issueHostedModel: false,
      issueFormError: ''
    })
  },

  closeIssueForm() {
    if (this.data.acting) return
    this.setData({ showIssueForm: false, issueFormError: '' })
  },

  onIssueCountInput(e) {
    this.setData({
      issueCount: (e.detail && e.detail.value) || '',
      issueFormError: ''
    })
  },

  onIssueDurationInput(e) {
    this.setData({
      issueDurationAmount: (e.detail && e.detail.value) || '',
      issueFormError: ''
    })
  },

  onIssueUnitPick(e) {
    const unit = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.unit
      : ''
    if (!unit) return
    this.setData({ issueDurationUnit: unit, issueFormError: '' })
  },

  closeIssued() {
    this.setData({ issuedCodes: [], issuedDays: 0, issuedDaysText: '' })
  },

  noop() {},

  copyIssued() {
    const text = (this.data.issuedCodes || []).join('\n')
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: copy.family.issueCopied, icon: 'none' })
      }
    })
  },

  async onIssueCodes() {
    if (this.data.acting) return
    const count = Number(String(this.data.issueCount || '').trim())
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      this.setData({ issueFormError: copy.family.issueCountInvalid })
      return
    }
    const durationAmount = Number(String(this.data.issueDurationAmount || '').trim())
    const durationUnit = this.data.issueDurationUnit || 'month'
    if (
      !Number.isFinite(durationAmount) ||
      durationAmount < 1 ||
      Math.floor(durationAmount) !== durationAmount
    ) {
      this.setData({ issueFormError: copy.family.issueDurationInvalid })
      return
    }
    this.setData({ acting: true, issueFormError: '' })
    try {
      const result = await callFamily('issueCodes', {
        product: 'capacity_90d',
        count: Math.floor(count),
        durationAmount: Math.floor(durationAmount),
        durationUnit,
        hostedModel: !!this.data.issueHostedModel
      })
      const codes = (result && result.codes) || []
      const days = (result && result.days) || 0
      const hosted = !!(result && result.hostedModel)
      this.setData({
        acting: false,
        showIssueForm: false,
        issuedCodes: codes,
        issuedDays: days,
        issuedHosted: hosted,
        issuedDaysText: days
          ? copy.family.issueResultDays(days) + (hosted ? ' · ' + copy.family.issueResultHosted : '')
          : ''
      })
    } catch (e) {
      this.setData({
        acting: false,
        issueFormError: e.message || copy.common.opFailed
      })
    }
  },

  onToggleIssueHosted() {
    this.setData({ issueHostedModel: !this.data.issueHostedModel, issueFormError: '' })
  },

  async openPlatformKeys() {
    if (this.data.acting) return
    if (!this.data.family || !this.data.family.isAdmin) return
    this.setData({ showPlatformPanel: true, platformError: '', platformApiKey: '', platformLabel: '' })
    await this.loadPlatformKeys()
  },

  closePlatformPanel() {
    if (this.data.acting) return
    this.setData({ showPlatformPanel: false, platformError: '' })
  },

  async loadPlatformKeys() {
    try {
      const data = await javaApi.callModule('ai', 'listPlatformKeys', {})
      const presets = (data && data.presets) || []
      const providerIndex = Math.min(this.data.platformProviderIndex || 0, Math.max(presets.length - 1, 0))
      const models = (presets[providerIndex] && presets[providerIndex].models) || []
      const defaultModel = models.findIndex((row) => row && row.isDefault)
      this.setData({
        platformKeys: (data && data.list) || [],
        platformPresets: presets,
        platformProviderNames: presets.map((row) => row.label),
        platformProviderIndex: providerIndex,
        platformModelNames: models.map((row) => row.label),
        platformModelIndex: defaultModel >= 0 ? defaultModel : 0,
        platformError: ''
      })
    } catch (e) {
      this.setData({ platformError: e.message || copy.common.loadFailed })
    }
  },

  onPlatformProviderChange(e) {
    const platformProviderIndex = Number(e.detail.value) || 0
    const provider = this.data.platformPresets[platformProviderIndex]
    const models = (provider && provider.models) || []
    const defaultModel = models.findIndex((row) => row && row.isDefault)
    this.setData({
      platformProviderIndex,
      platformModelNames: models.map((row) => row.label),
      platformModelIndex: defaultModel >= 0 ? defaultModel : 0
    })
  },

  onPlatformModelChange(e) {
    this.setData({ platformModelIndex: Number(e.detail.value) || 0 })
  },

  onPlatformKeyInput(e) {
    this.setData({ platformApiKey: (e.detail && e.detail.value) || '', platformError: '' })
  },

  onPlatformLabelInput(e) {
    this.setData({ platformLabel: (e.detail && e.detail.value) || '' })
  },

  async onAddPlatformKey() {
    if (this.data.acting) return
    const apiKey = String(this.data.platformApiKey || '').trim()
    const provider = this.data.platformPresets[this.data.platformProviderIndex]
    const model = provider && provider.models && provider.models[this.data.platformModelIndex]
    if (!provider || !model) {
      this.setData({ platformError: copy.common.loadFailed })
      return
    }
    if (!apiKey) {
      this.setData({ platformError: copy.ai.keyRequired })
      return
    }
    this.setData({ acting: true, platformError: '' })
    try {
      await javaApi.callModule('ai', 'addPlatformKey', {
        apiKey,
        label: String(this.data.platformLabel || '').trim(),
        provider: provider.id,
        model: model.id
      })
      this.setData({ acting: false, platformApiKey: '', platformLabel: '' })
      wx.showToast({ title: copy.family.platformAdded, icon: 'none' })
      await this.loadPlatformKeys()
    } catch (e) {
      this.setData({ acting: false, platformError: e.message || copy.common.opFailed })
    }
  },

  async onMovePlatformKey(e) {
    if (this.data.acting) return
    const keyId = e.currentTarget.dataset.id
    const direction = e.currentTarget.dataset.direction
    if (!keyId || !direction) return
    this.setData({ acting: true, platformError: '' })
    try {
      await javaApi.callModule('ai', 'movePlatformKey', { keyId, direction })
      this.setData({ acting: false })
      await this.loadPlatformKeys()
    } catch (err) {
      this.setData({ acting: false, platformError: err.message || copy.common.opFailed })
    }
  },

  async onTogglePlatformKey(e) {
    if (this.data.acting) return
    const keyId = e.currentTarget.dataset.id
    const enabled = String(e.currentTarget.dataset.enabled) !== 'true'
    if (!keyId) return
    this.setData({ acting: true, platformError: '' })
    try {
      await javaApi.callModule('ai', 'setPlatformKeyEnabled', { keyId, enabled })
      this.setData({ acting: false })
      await this.loadPlatformKeys()
    } catch (err) {
      this.setData({ acting: false, platformError: err.message || copy.common.opFailed })
    }
  },

  async onRemovePlatformKey(e) {
    if (this.data.acting) return
    const keyId = e.currentTarget.dataset.id
    if (!keyId) return
    this.setData({ acting: true, platformError: '' })
    try {
      await javaApi.callModule('ai', 'removePlatformKey', { keyId })
      this.setData({ acting: false })
      wx.showToast({ title: copy.family.platformRemoved, icon: 'success' })
      await this.loadPlatformKeys()
    } catch (err) {
      this.setData({ acting: false, platformError: err.message || copy.common.opFailed })
    }
  },

  openCapacityRedeem() {
    if (this.data.acting) return
    this.setData({
      showModal: true,
      modalMode: 'capacityRedeem',
      modalTitle: copy.family.capacityRedeemTitle,
      modalPlaceholder: copy.family.capacityRedeemPlaceholder,
      modalValue: '',
      modalMaxlength: 20,
      modalConfirm: copy.family.capacityRedeemSubmit,
      editingFamilyId: '',
      modalError: ''
    })
  },

  onCapacityHelp() {
    wx.showModal({
      title: copy.family.capacityHelpTitle,
      content: copy.family.capacityHelpBody,
      showCancel: false,
      confirmText: copy.family.capacityHelpConfirm
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
    if (this.data.modalMode === 'join' || this.data.modalMode === 'capacityRedeem') {
      value = value.toUpperCase()
    }
    this.setData({ modalValue: value, modalError: '' })
  },

  async onSaveModal() {
    if (this.data.modalMode === 'join') return this.onJoin()
    if (this.data.modalMode === 'rename') return this.onRename()
    if (this.data.modalMode === 'capacityRedeem') return this.onCapacityRedeem()
    return this.onCreate()
  },

  async onCapacityRedeem() {
    if (this.data.acting) return
    const code = (this.data.modalValue || '').trim()
    if (!code) {
      this.setData({ modalError: copy.family.capacityCodeRequired })
      return
    }
    this.setData({ acting: true, modalError: '' })
    try {
      const result = await callFamily('redeem', { code })
      const family = (result && result.family) || result
      if (family && family._id) {
        this.applyCurrentFamily(family)
      }
      this.setData({ showModal: false, modalValue: '', acting: false })
      wx.showToast({ title: copy.family.capacityRedeemOk, icon: 'success' })
      await this.load()
    } catch (e) {
      this.setData({
        acting: false,
        modalError: e.message || copy.common.opFailed
      })
    }
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
      wx.showToast({ title: copy.family.createdToast, icon: 'none' })
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
      wx.showToast({ title: copy.family.renamedToast, icon: 'none' })
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
      wx.showToast({ title: copy.family.joinedToast, icon: 'success' })
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
      const membersRes = await callFamily('listMembers').catch(() => null)
      if (membersRes) {
        this.setData({
          members: mapMembers(membersRes.list || []),
          ...profileView(membersRes.profile || this.data.profile)
        })
      }
      this.setData({ acting: false, switching: false })
      wx.showToast({ title: copy.family.switchedToast, icon: 'none' })
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
        ...actionIcons(theme),
        ...eyeIcons(theme),
        ...this.syncCodeDisplay(family),
        headerTitle: family.name || '家庭'
      })
      wx.showToast({ title: copy.family.moodUpdatedToast, icon: 'none' })
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
