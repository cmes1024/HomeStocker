const { callFamily } = require('../../utils/cloud')
const javaApi = require('../../utils/javaApi')
const { ensureSession } = require('../../utils/session')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const copy = require('../../utils/copy')

const DAY_MS = 24 * 3600 * 1000

const STATUS_FILTERS = [
  { key: '', label: copy.admin.filterAll },
  { key: 'used', label: copy.admin.filterUsed },
  { key: 'unused', label: copy.admin.filterUnused }
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 后端给的是 epoch 毫秒，统一按东八区展示。 */
function formatTime(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n + 8 * 3600 * 1000)
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

function whoText(row) {
  const family =
    row.familyName ||
    (row.familyIdShort
      ? `${copy.admin.unknownFamily} ${row.familyIdShort}`
      : copy.admin.unknownFamily)
  return row.usedByName ? `${family} / ${row.usedByName}` : family
}

/**
 * 同一次发放走同一事务，created_at 完全一致；按
 * (createdAt, product, days, hostedModel) 还原「批」。
 * 库里只有 code_hash，未使用的码无法逐张标识。
 */
function groupBatches(items, statusFilter) {
  const map = new Map()
  const out = []
  ;(items || []).forEach((row) => {
    const key = [
      row.createdAt || 0,
      row.product || '',
      row.days || 0,
      row.hostedModel ? 1 : 0,
      row.note || ''
    ].join('|')
    let batch = map.get(key)
    if (!batch) {
      batch = {
        key,
        timeText: formatTime(row.createdAt) || copy.admin.batchUnknown,
        daysText: copy.admin.batchTitle(row.days || 0),
        noteText: row.note || '',
        hosted: !!row.hostedModel,
        total: 0,
        used: 0,
        unused: 0,
        revoked: 0,
        lineText: '',
        legacyUnusedText: '',
        rows: [],
        legacyUnused: 0,
        open: false
      }
      map.set(key, batch)
      out.push(batch)
    }
    batch.total += 1
    const codeText = row.codeMask || '—'
    if (row.status === 'used') {
      batch.used += 1
      // 到期 ≈ 兑换时刻 + 该码天数；家庭若有剩余时长会顺延，这里只反映这张码本身带来的时长
      const usedMs = Number(row.usedAt)
      const expireMs = usedMs > 0 && row.days > 0 ? usedMs + row.days * DAY_MS : 0
      batch.rows.push({
        key: `${key}-u${batch.used}`,
        codeText,
        used: true,
        order: 0,
        stateText: copy.admin.stateUsed,
        detailText: [
          formatTime(row.usedAt),
          whoText(row),
          expireMs ? copy.admin.expireAt(formatTime(expireMs)) : ''
        ]
          .filter(Boolean)
          .join(' · ')
      })
    } else if (row.status === 'revoked') {
      batch.revoked += 1
      batch.rows.push({
        key: `${key}-r${batch.revoked}`,
        codeText,
        used: false,
        order: 2,
        stateText: copy.admin.stateRevoked,
        detailText: ''
      })
    } else {
      batch.unused += 1
      if (row.codeMask) {
        batch.rows.push({
          key: `${key}-n${batch.unused}`,
          codeText,
          used: false,
          order: 1,
          stateText: copy.admin.stateUnused,
          detailText: row.days > 0 ? copy.admin.afterRedeem(row.days) : ''
        })
      } else {
        // 掩码之前发放的旧记录，无法逐张标识，按张数合并
        batch.legacyUnused += 1
      }
    }
  })
  out.forEach((b) => {
    if (statusFilter === 'used') {
      b.lineText = copy.admin.batchLineUsed(b.used)
    } else if (statusFilter === 'unused') {
      b.lineText = copy.admin.batchLineUnused(b.unused)
    } else {
      b.lineText = copy.admin.batchLine(b.total, b.used, b.unused)
    }
    b.rows.sort((x, y) => x.order - y.order)
    b.legacyUnusedText = b.legacyUnused ? copy.admin.unusedHint(b.legacyUnused) : ''
  })
  return out
}

function emptySummary() {
  return { total: 0, used: 0, unused: 0, revoked: 0, used7d: 0 }
}

Page({
  data: {
    copy: copy.admin,
    adminCopy: copy.admin,
    common: copy.common,
    theme: null,
    headerTitle: copy.admin.title,
    loading: true,
    loadingColors: ['#C4A484', '#C4A484'],
    error: '',
    acting: false,
    isAdmin: false,
    summary: emptySummary(),
    filters: STATUS_FILTERS,
    statusFilter: '',
    batches: [],
    showIssueForm: false,
    issueCount: '1',
    issueDurationAmount: '3',
    issueDurationUnit: 'month',
    issueHostedModel: false,
    issueNote: '',
    issueFormError: '',
    issuedCodes: [],
    issuedDaysText: '',
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

  onLoad() {
    bindThemeToPage(this, { headerTitle: copy.admin.title })
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: copy.admin.title })
    try {
      const session = await ensureSession()
      if (!session || !session.hasFamily) {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      const family = session.family || {}
      if (!family.isAdmin) {
        this.setData({ loading: false })
        wx.showToast({ title: copy.admin.forbidden, icon: 'none' })
        setTimeout(() => {
          if (getCurrentPages().length > 1) wx.navigateBack()
          else wx.reLaunch({ url: '/pages/items/index' })
        }, 800)
        return
      }
      setAppFamily(family)
      bindThemeToPage(this, { headerTitle: copy.admin.title })
      this.setData({ isAdmin: true })
      this.load()
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

  async load() {
    this.setData(this.data.batches.length ? { error: '' } : { loading: true, error: '' })
    try {
      const data = await callFamily('listRedeemCodes', {
        status: this.data.statusFilter,
        limit: 100
      })
      const batches = groupBatches((data && data.items) || [], this.data.statusFilter)
      const openKeys = new Set((this.data.batches || []).filter((b) => b.open).map((b) => b.key))
      batches.forEach((b) => {
        if (openKeys.has(b.key)) b.open = true
      })
      this.setData({
        batches,
        summary: (data && data.summary) || emptySummary(),
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

  onFilter(e) {
    const key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || ''
    if (key === this.data.statusFilter) return
    this.setData({ statusFilter: key })
    this.load()
  },

  onToggleBatch(e) {
    const key = e.currentTarget.dataset && e.currentTarget.dataset.key
    if (!key) return
    const batches = (this.data.batches || []).map((b) =>
      b.key === key ? { ...b, open: !b.open } : b
    )
    this.setData({ batches })
  },

  /** 第三列：滚到记录区并刷新。 */
  onJumpRecords() {
    wx.pageScrollTo({ selector: '#records', offsetTop: -80, duration: 200 })
    this.load()
  },

  openIssue() {
    if (this.data.acting) return
    this.setData({
      showIssueForm: true,
      issueCount: '1',
      issueDurationAmount: '3',
      issueDurationUnit: 'month',
      issueHostedModel: false,
      issueNote: '',
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

  onIssueNoteInput(e) {
    this.setData({ issueNote: (e.detail && e.detail.value) || '', issueFormError: '' })
  },

  onIssueUnitPick(e) {
    const unit = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.unit
      : ''
    if (!unit) return
    this.setData({ issueDurationUnit: unit, issueFormError: '' })
  },

  closeIssued() {
    this.setData({ issuedCodes: [], issuedDaysText: '' })
  },

  noop() {},

  copyIssued() {
    const text = (this.data.issuedCodes || []).join('\n')
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: copy.admin.issueCopied, icon: 'success' })
      }
    })
  },

  async onIssueCodes() {
    if (this.data.acting) return
    const count = Number(String(this.data.issueCount || '').trim())
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      this.setData({ issueFormError: copy.admin.issueCountInvalid })
      return
    }
    const durationAmount = Number(String(this.data.issueDurationAmount || '').trim())
    const durationUnit = this.data.issueDurationUnit || 'month'
    if (
      !Number.isFinite(durationAmount) ||
      durationAmount < 1 ||
      Math.floor(durationAmount) !== durationAmount
    ) {
      this.setData({ issueFormError: copy.admin.issueDurationInvalid })
      return
    }
    this.setData({ acting: true, issueFormError: '' })
    try {
      const result = await callFamily('issueCodes', {
        product: 'capacity_90d',
        count: Math.floor(count),
        durationAmount: Math.floor(durationAmount),
        durationUnit,
        hostedModel: !!this.data.issueHostedModel,
        note: String(this.data.issueNote || '').trim()
      })
      const codes = (result && result.codes) || []
      const days = (result && result.days) || 0
      const hosted = !!(result && result.hostedModel)
      this.setData({
        acting: false,
        showIssueForm: false,
        issuedCodes: codes,
        issuedDaysText: days
          ? copy.admin.issueResultDays(days) + (hosted ? ' · ' + copy.admin.issueResultHosted : '')
          : ''
      })
      this.load()
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
    this.setData({
      showPlatformPanel: true,
      platformError: '',
      platformApiKey: '',
      platformLabel: ''
    })
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
      const providerIndex = Math.min(
        this.data.platformProviderIndex || 0,
        Math.max(presets.length - 1, 0)
      )
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
      wx.showToast({ title: copy.admin.platformAdded, icon: 'none' })
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
      wx.showToast({ title: copy.admin.platformRemoved, icon: 'success' })
      await this.loadPlatformKeys()
    } catch (err) {
      this.setData({ acting: false, platformError: err.message || copy.common.opFailed })
    }
  }
})
