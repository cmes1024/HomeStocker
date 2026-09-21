const { callItem, callSpace, callTag, callActivity } = require('../../utils/cloud')
const { listLocations } = require('../../utils/db')
const { bindThemeToPage } = require('../../utils/theme')
const { shelfLifeStatus } = require('../../utils/expireStatus')
const { formatActivityLine } = require('../../utils/activityLine')
const { takePendingItemSnapshot } = require('../../utils/itemDetailNav')
const copy = require('../../utils/copy')

const ITEM_COMPARE_KEYS = [
  '_id',
  'name',
  'quantity',
  'unit',
  'note',
  'spaceId',
  'locationId',
  'productionDate',
  'expireDate',
  'expireReminderEnabled',
  'updatedAt',
  'createdAt',
  'source'
]

function formatRelativeTime(ts) {
  const t = Number(ts) || 0
  if (!t) return ''
  const diff = Date.now() - t
  if (diff < 60 * 1000) return copy.messages.justNow
  if (diff < 60 * 60 * 1000) {
    return copy.messages.minutesAgo(Math.floor(diff / (60 * 1000)))
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return copy.messages.hoursAgo(Math.floor(diff / (60 * 60 * 1000)))
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return copy.messages.daysAgo(Math.floor(diff / (24 * 60 * 60 * 1000)))
  }
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function mapActivityRows(list) {
  return (list || []).map((row) => {
    const nickname =
      (row && row.actorNickname && String(row.actorNickname).trim()) || ''
    return {
      _id: row._id,
      line: formatActivityLine(row, copy.detail),
      timeLabel: formatRelativeTime(row.createdAt),
      avatarUrl: (row && row.actorAvatarUrl) || '',
      initial: nickname ? nickname.slice(0, 1) : '家'
    }
  })
}

function tagIdsKey(ids) {
  return (ids || [])
    .map((id) => String(id))
    .filter(Boolean)
    .join(',')
}

function itemCoreEqual(a, b) {
  if (!a || !b) return false
  for (let i = 0; i < ITEM_COMPARE_KEYS.length; i++) {
    const k = ITEM_COMPARE_KEYS[i]
    if (String(a[k] == null ? '' : a[k]) !== String(b[k] == null ? '' : b[k])) {
      return false
    }
  }
  return tagIdsKey(a.tagIds) === tagIdsKey(b.tagIds)
}

function normalizeSnapshot(raw) {
  if (!raw || !raw._id) return null
  const tagNames = Array.isArray(raw.tagNames)
    ? raw.tagNames.filter(Boolean)
    : []
  return {
    item: raw,
    spaceName: typeof raw.spaceName === 'string' ? raw.spaceName : '',
    locationName: typeof raw.locationName === 'string' ? raw.locationName : '',
    tagNames
  }
}

Page({
  data: {
    copy: copy.detail,
    common: copy.common,
    itemId: '',
    item: null,
    spaceName: '',
    locationName: '',
    tagNames: [],
    expireStatus: '',
    expireLabel: '',
    recentOps: [],
    loading: true,
    error: '',
    removing: false,
    headerTitle: copy.detail.pageTitle,
    theme: null,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad(options) {
    const itemId = (options && options.id) || ''
    this._readyForShowRefresh = false
    this._loadSeq = 0

    bindThemeToPage(this, {
      itemId,
      loading: true,
      error: itemId ? '' : copy.detail.missingId,
      headerTitle: copy.detail.pageTitle
    })
    this.syncLoadingColors()

    if (!itemId) {
      this.setData({ loading: false })
      return
    }

    const pending = normalizeSnapshot(takePendingItemSnapshot(itemId))
    if (pending) {
      this._snapshotUsed = true
      this.applyItemView(pending.item, {
        spaceName: pending.spaceName,
        locationName: pending.locationName,
        tagNames: pending.tagNames
      })
      this.load(itemId, { silent: true, soft: true })
      return
    }

    try {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
      if (channel && typeof channel.on === 'function') {
        channel.on('itemSnapshot', (payload) => {
          if (this._snapshotUsed || this.data.item) return
          const snap = normalizeSnapshot(payload && payload.item)
          if (!snap || String(snap.item._id) !== String(itemId)) return
          this._snapshotUsed = true
          this.applyItemView(snap.item, {
            spaceName: snap.spaceName,
            locationName: snap.locationName,
            tagNames: snap.tagNames
          })
          this.load(itemId, { silent: true, soft: true })
        })
      }
    } catch (e) {
      // ignore
    }

    // 深链 / 无快照：立即完整拉取；若随后 eventChannel 赶到，soft load 会用更高 seq 覆盖
    this.load(itemId, { silent: false })
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: copy.detail.pageTitle })
    this.syncLoadingColors()
    if (!this._readyForShowRefresh) {
      this._readyForShowRefresh = true
      return
    }
    if (this.data.itemId && !this.data.loading && !this.data.removing) {
      this.load(this.data.itemId, { silent: true, soft: !!this.data.item })
    }
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
  },

  notifyDeletedAndBack() {
    wx.showModal({
      title: copy.detail.deletedTitle,
      content: copy.detail.deletedContent,
      showCancel: false,
      success: () => wx.navigateBack()
    })
  },

  applyItemView(item, options = {}) {
    if (!item || !item._id) return
    const life = shelfLifeStatus(item.expireDate)
    const patch = {
      item,
      itemId: item._id,
      expireStatus: life.status,
      expireLabel: life.label,
      loading: false,
      error: ''
    }
    if (options.spaceName !== undefined) patch.spaceName = options.spaceName
    if (options.locationName !== undefined) patch.locationName = options.locationName
    if (options.tagNames !== undefined) patch.tagNames = options.tagNames
    if (options.recentOps !== undefined) patch.recentOps = options.recentOps
    this.setData(patch)
    this.syncLoadingColors()
  },

  async resolvePlaceAndTags(item, soft) {
    let spaceName = soft ? this.data.spaceName || '' : ''
    let locationName = soft ? this.data.locationName || '' : ''
    let tagNames = soft ? this.data.tagNames || [] : []

    const prev = this.data.item
    const spaceSame = soft && prev && String(prev.spaceId || '') === String(item.spaceId || '')
    const locSame = soft && prev && String(prev.locationId || '') === String(item.locationId || '')
    const tagsSame = soft && prev && tagIdsKey(prev.tagIds) === tagIdsKey(item.tagIds)

    const needSpace = !!item.spaceId && !(spaceSame && spaceName)
    const needLoc = !!item.spaceId && !!item.locationId && !(locSame && locationName)
    const needTags =
      !!(item.tagIds && item.tagIds.length) && !(tagsSame && tagNames.length)

    if (!item.spaceId) {
      spaceName = ''
      locationName = ''
    } else if (needSpace) {
      try {
        const listed = await callSpace('list')
        const spaces = (listed && listed.list) || []
        const space = spaces.find((s) => s._id === item.spaceId)
        spaceName = (space && space.name) || ''
      } catch (e) {
        spaceName = soft ? spaceName : ''
      }
    }

    if (!item.locationId) {
      locationName = ''
    } else if (needLoc) {
      try {
        const locations = await listLocations(item.spaceId)
        const loc = locations.find((l) => l._id === item.locationId)
        locationName = (loc && loc.name) || ''
      } catch (e) {
        locationName = soft ? locationName : ''
      }
    }

    if (!(item.tagIds && item.tagIds.length)) {
      tagNames = []
    } else if (needTags) {
      try {
        const listed = await callTag('list')
        const tags = (listed && listed.list) || []
        const byId = {}
        tags.forEach((t) => {
          byId[t._id] = t.name
        })
        tagNames = item.tagIds.map((id) => byId[id]).filter(Boolean)
      } catch (e) {
        tagNames = soft ? tagNames : []
      }
    }

    return { spaceName, locationName, tagNames }
  },

  async loadRecentOps(itemId) {
    try {
      const act = await callActivity('list', { itemId, limit: 10 })
      return mapActivityRows((act && act.list) || [])
    } catch (e) {
      return []
    }
  },

  async load(itemId, options = {}) {
    const soft = !!options.soft && !!this.data.item
    const silent = (!!options.silent && !!this.data.item) || soft
    const seq = (this._loadSeq || 0) + 1
    this._loadSeq = seq

    if (!silent) {
      this.setData({ loading: true, error: '', itemId })
    } else {
      this.setData({ error: '', itemId })
    }

    try {
      let item
      let place
      let recentOps

      try {
        const pack = await callItem('detail', { itemId, activityLimit: 10 })
        if (seq !== this._loadSeq) return
        item = pack && pack.item
        if (!item || !item._id) {
          const err = new Error(copy.detail.missingId)
          err.code = 'NOT_FOUND'
          throw err
        }
        place = {
          spaceName: (pack && pack.spaceName) || '',
          locationName: (pack && pack.locationName) || '',
          tagNames: (pack && pack.tagNames) || []
        }
        recentOps = mapActivityRows((pack && pack.recentOps) || [])
      } catch (e) {
        if (e && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN' || e.code === 'NO_FAMILY')) {
          throw e
        }
        // 未部署 item.detail 时降级旧路径
        item = await callItem('get', { itemId })
        if (seq !== this._loadSeq) return
        place = await this.resolvePlaceAndTags(item, soft)
        if (seq !== this._loadSeq) return
        recentOps = null
      }

      const sameBody = soft && itemCoreEqual(this.data.item, item)
      const samePlace =
        soft &&
        (this.data.spaceName || '') === (place.spaceName || '') &&
        (this.data.locationName || '') === (place.locationName || '') &&
        tagIdsKey(this.data.tagNames) === tagIdsKey(place.tagNames)

      if (!(sameBody && samePlace)) {
        this.applyItemView(item, {
          spaceName: place.spaceName,
          locationName: place.locationName,
          tagNames: place.tagNames
        })
      } else {
        this.setData({ loading: false, error: '' })
      }

      if (recentOps) {
        if (seq !== this._loadSeq) return
        this.setData({ recentOps })
      } else {
        const ops = await this.loadRecentOps(itemId)
        if (seq !== this._loadSeq) return
        this.setData({ recentOps: ops })
      }
    } catch (e) {
      if (seq !== this._loadSeq) return
      if (e.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
        return
      }
      // soft 失败保留快照，不盖成错误页
      if (soft && this.data.item) {
        this.setData({ loading: false })
        return
      }
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    if (!this.data.itemId) return
    this.load(this.data.itemId, { silent: false, soft: false })
  },

  goAssist() {
    const id = this.data.itemId
    const item = this.data.item
    if (!id || !item) return
    wx.navigateTo({
      url: `/packageAiAssist/assist/index?itemId=${encodeURIComponent(id)}`,
      fail: () => wx.showToast({ title: copy.assist.openFail, icon: 'none' })
    })
  },

  goEdit() {
    const id = this.data.itemId
    if (!id) return
    wx.navigateTo({ url: `/pages/items/edit?id=${id}` })
  },

  async onRemove() {
    if (this.data.removing || !this.data.itemId) return
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.detail.removeTitle,
        content: copy.detail.removeContent,
        confirmText: copy.detail.removeConfirm,
        confirmColor: '#FA5151',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return

    this.setData({ removing: true })
    try {
      await callItem('remove', { itemId: this.data.itemId })
      wx.showToast({ title: copy.detail.removedToast, icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
        return
      }
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
      this.setData({ removing: false })
    }
  }
})
