const { callAi } = require('../utils/callAi')
const { callItem, callSpace } = require('../../utils/cloud')
const { ensureSession } = require('../../utils/session')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { compressImageForUpload } = require('../../utils/imageCompress')
const copy = require('../../utils/copy')

const MAX_ROWS = 9

function nextIndex(rows) {
  let max = 0
  ;(rows || []).forEach((row) => {
    const n = Number(row && row.index)
    if (n > max) max = n
  })
  return max + 1
}

function writableCard(card) {
  return !!(card && String(card.name || '').trim() && !card.error && !card.abandoned && !card.saved)
}

function confirmCount(cards) {
  return (cards || []).filter(writableCard).length
}

function primaryLabel(count) {
  return count > 0 ? copy.ai.confirmN(count) : copy.ai.abandonAll
}

function previewState(cards, index) {
  const n = (cards || []).length
  let i = Number(index) || 0
  if (i < 0) i = 0
  if (n && i > n - 1) i = n - 1
  if (!n) i = 0
  return {
    previewIndex: i,
    previewHint: n > 0 ? `${i + 1} / ${n}` : ''
  }
}

Page({
  data: {
    copy: copy.ai,
    detail: copy.detail,
    common: copy.common,
    theme: null,
    headerTitle: copy.ai.captureTitle,
    bootLoading: true,
    bootError: '',
    step: 'collect',
    rows: [],
    cards: [],
    previewIndex: 0,
    previewHint: '',
    confirmCount: 0,
    primaryLabel: copy.ai.abandonAll,
    hasKey: true,
    extracting: false,
    saving: false,
    acting: false,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad() {
    bindThemeToPage(this, { headerTitle: copy.ai.captureTitle })
    this.syncLoadingColors()
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: copy.ai.captureTitle })
    this.syncLoadingColors()
    try {
      const session = await ensureSession()
      if (!session || !session.hasFamily) {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      setAppFamily(session.family)
      bindThemeToPage(this, {
        headerTitle: copy.ai.captureTitle,
        bootLoading: false,
        bootError: ''
      })
      this.syncLoadingColors()
      if (!this._keyHintReady) {
        this._keyHintReady = true
        this.loadKeyHint()
      } else if (this._refreshKeysOnShow) {
        this._refreshKeysOnShow = false
        this.loadKeyHint()
      }
    } catch (e) {
      this.setData({
        bootLoading: false,
        bootError: e.message || copy.common.loadFailed
      })
    }
  },

  onUnload() {
    this._unloading = true
  },

  async loadKeyHint() {
    try {
      const data = await callAi('listKeys')
      const list = (data && data.list) || []
      this.setData({ hasKey: list.length > 0 })
    } catch (e) {
      this.setData({ hasKey: true })
    }
  },

  goKeys() {
    this._refreshKeysOnShow = true
    wx.navigateTo({
      url: '/packageAi/keys/index',
      fail: () => wx.showToast({ title: copy.ai.fabFail, icon: 'none' })
    })
  },

  onRetryBoot() {
    this._keyHintReady = false
    this.setData({ bootLoading: true, bootError: '' })
    this.onShow()
  },

  async addPhotos() {
    if (this.data.acting || this.data.extracting || this.data.saving) return
    const remain = MAX_ROWS - (this.data.rows || []).length
    if (remain <= 0) {
      wx.showToast({ title: '一次最多 9 张', icon: 'none' })
      return
    }
    let files
    try {
      const res = await wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })
      files = (res && res.tempFiles) || []
    } catch (e) {
      return
    }
    if (!files.length) return

    const rows = (this.data.rows || []).slice()
    let index = nextIndex(rows)
    for (let i = 0; i < files.length; i++) {
      const src = files[i] && files[i].tempFilePath
      if (!src) continue
      const path = await compressImageForUpload(src, { maxEdge: 1280, quality: 72 })
      rows.push({
        index,
        path: path || src,
        text: ''
      })
      index += 1
    }
    this.setData({ rows, step: 'collect' })
  },

  onRowText(e) {
    const index = Number(e.currentTarget.dataset.index)
    const value = (e.detail && e.detail.value) || ''
    const rows = this.data.rows || []
    const i = rows.findIndex((r) => r.index === index)
    if (i < 0) return
    this.setData({ [`rows[${i}].text`]: value })
  },

  removeRow(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      rows: (this.data.rows || []).filter((r) => r.index !== index)
    })
  },

  async startExtract() {
    if (this.data.extracting || this.data.saving || this.data.acting) return
    const rows = this.data.rows || []
    const filled = rows.filter((r) => String(r.text || '').trim())
    if (!filled.length) {
      wx.showToast({ title: copy.ai.textRequired, icon: 'none' })
      return
    }
    const skipped = rows.length - filled.length
    if (skipped > 0) {
      wx.showToast({ title: copy.ai.skippedEmpty(skipped), icon: 'none' })
    }

    this.setData({ extracting: true, acting: true })
    try {
      const data = await callAi('extract', {
        rows: filled.map((r) => ({ index: r.index, text: String(r.text).trim() }))
      })
      const drafts = (data && data.drafts) || []
      const cards = drafts.map((d, i) => {
        const row = rows.find((r) => r.index === d.index)
        const error = d.error || (!String(d.name || '').trim() ? copy.ai.nameEmpty : '')
        const blocked = !!error
        return {
          ...d,
          cardKey: `${d.index}-${i}`,
          path: (row && row.path) || '',
          tagNames: Array.isArray(d.tagNames) ? d.tagNames : [],
          error,
          abandoned: blocked,
          blocked
        }
      })
      const count = confirmCount(cards)
      this.setData({
        step: 'preview',
        cards,
        confirmCount: count,
        primaryLabel: primaryLabel(count),
        extracting: false,
        acting: false,
        ...previewState(cards, 0)
      })
    } catch (e) {
      this.setData({ extracting: false, acting: false, step: 'collect' })
      if (e.code === 'NO_AI_KEY') {
        this.setData({ hasKey: false })
        wx.showModal({
          title: copy.ai.noKey,
          content: copy.ai.keysHint,
          confirmText: copy.ai.goKeys,
          success: (res) => {
            if (res.confirm) this.goKeys()
          }
        })
        return
      }
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    }
  },

  backCollect() {
    if (this.data.saving) return
    this.setData({
      step: 'collect',
      cards: [],
      previewIndex: 0,
      previewHint: '',
      confirmCount: 0,
      primaryLabel: copy.ai.abandonAll
    })
  },

  onPreviewChange(e) {
    const current = Number(e.detail && e.detail.current)
    if (!Number.isFinite(current) || current === this.data.previewIndex) return
    this.setData(previewState(this.data.cards, current))
  },

  toggleAbandon(e) {
    if (this.data.saving) return
    const i = Number(e.currentTarget.dataset.i)
    const cards = this.data.cards || []
    const card = cards[i]
    if (!card || card.blocked) return
    const next = !card.abandoned
    const count = confirmCount(
      cards.map((c, idx) => (idx === i ? { ...c, abandoned: next } : c))
    )
    this.setData({
      [`cards[${i}].abandoned`]: next,
      confirmCount: count,
      primaryLabel: primaryLabel(count)
    })
  },

  async onPrimary() {
    if (this.data.saving || this.data.acting) return
    const count = this.data.confirmCount
    if (count <= 0) {
      this.abandonSession()
      return
    }
    await this.saveKept()
  },

  abandonSession() {
    if (this.data.saving) return
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/items/index' })
    })
  },

  async saveKept() {
    const kept = (this.data.cards || []).filter(writableCard)
    if (!kept.length) {
      this.abandonSession()
      return
    }
    this.setData({ saving: true, acting: true })
    wx.showLoading({ title: copy.ai.saving, mask: true })
    let okCount = 0
    let mediaWarn = false
    try {
      for (let i = 0; i < kept.length; i++) {
        const card = kept[i]
        try {
          let locationId = card.locationId || ''
          if (card.willCreateLocation && card.spaceId && card.locationName) {
            const loc = await callSpace('createLocation', {
              spaceId: card.spaceId,
              name: card.locationName
            })
            locationId = (loc && loc._id) || ''
          }
          const item = await callItem('create', {
            name: String(card.name).trim(),
            quantity: card.quantity,
            unit: card.unit || '',
            note: card.note || '',
            spaceId: card.spaceId || '',
            locationId: locationId || null,
            tagIds: card.tagIds || [],
            productionDate: card.productionDate || null,
            expireDate: card.expireDate || null,
            source: 'agent'
          })
          okCount += 1
          const all = this.data.cards || []
          const cardPos = all.findIndex((c) => c.cardKey === card.cardKey)
          if (cardPos >= 0) {
            this.setData({ [`cards[${cardPos}].saved`]: true })
          }
          if (card.path && item && item._id) {
            try {
              const familyId =
                (getApp().globalData && getApp().globalData.familyId) || 'family'
              const cloudPath = `itemMedia/${familyId}/${item._id}.jpg`
              const up = await wx.cloud.uploadFile({
                cloudPath,
                filePath: card.path
              })
              if (up && up.fileID) {
                await callAi('attachMedia', { itemId: item._id, fileID: up.fileID })
              }
            } catch (mediaErr) {
              mediaWarn = true
            }
          }
        } catch (err) {
          wx.hideLoading()
          const cardsNow = this.data.cards || []
          const count = confirmCount(cardsNow)
          this.setData({
            saving: false,
            acting: false,
            confirmCount: count,
            primaryLabel: primaryLabel(count)
          })
          wx.showModal({
            title: copy.common.opFailed,
            content: copy.ai.savePartialFail(okCount, i + 1),
            showCancel: false
          })
          return
        }
      }
      wx.hideLoading()
      this.setData({ saving: false, acting: false })
      if (mediaWarn) {
        wx.showToast({ title: copy.ai.mediaWarn, icon: 'none' })
      }
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/items/index' })
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ saving: false, acting: false })
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    }
  }
})
