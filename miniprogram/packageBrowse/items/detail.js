const { callItem, callSpace, callTag, callActivity } = require('../../utils/cloud')
const { listLocations } = require('../../utils/db')
const { bindThemeToPage } = require('../../utils/theme')
const { shelfLifeStatus } = require('../../utils/expireStatus')
const { formatActivityLine } = require('../../utils/activityLine')
const copy = require('../../utils/copy')

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
    return {
      _id: row._id,
      line: formatActivityLine(row, copy.detail),
      timeLabel: formatRelativeTime(row.createdAt)
    }
  })
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
    bindThemeToPage(this, {
      itemId,
      loading: true,
      error: itemId ? '' : copy.detail.missingId,
      headerTitle: copy.detail.pageTitle
    })
    this.syncLoadingColors()
    if (itemId) {
      this.load(itemId, { silent: false })
    } else {
      this.setData({ loading: false })
    }
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: copy.detail.pageTitle })
    this.syncLoadingColors()
    if (this.data.itemId && !this.data.loading && !this.data.removing) {
      this.load(this.data.itemId, { silent: true })
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

  async load(itemId, options = {}) {
    const silent = !!options.silent && !!this.data.item
    if (!silent) {
      this.setData({ loading: true, error: '', itemId })
    } else {
      this.setData({ error: '', itemId })
    }

    try {
      const item = await callItem('get', { itemId })
      let spaceName = ''
      let locationName = ''
      let tagNames = []

      if (item.spaceId) {
        try {
          const listed = await callSpace('list')
          const spaces = (listed && listed.list) || []
          const space = spaces.find((s) => s._id === item.spaceId)
          spaceName = (space && space.name) || ''
        } catch (e) {
          spaceName = ''
        }
      }

      if (item.spaceId && item.locationId) {
        try {
          const locations = await listLocations(item.spaceId)
          const loc = locations.find((l) => l._id === item.locationId)
          locationName = (loc && loc.name) || ''
        } catch (e) {
          locationName = ''
        }
      }

      if (item.tagIds && item.tagIds.length) {
        try {
          const listed = await callTag('list')
          const tags = (listed && listed.list) || []
          const byId = {}
          tags.forEach((t) => {
            byId[t._id] = t.name
          })
          tagNames = item.tagIds.map((id) => byId[id]).filter(Boolean)
        } catch (e) {
          tagNames = []
        }
      }

      const life = shelfLifeStatus(item.expireDate)

      let recentOps = []
      try {
        const act = await callActivity('list', { itemId, limit: 10 })
        recentOps = mapActivityRows((act && act.list) || [])
      } catch (e) {
        recentOps = []
      }

      this.setData({
        item,
        spaceName,
        locationName,
        tagNames,
        expireStatus: life.status,
        expireLabel: life.label,
        recentOps,
        loading: false,
        error: ''
      })
      this.syncLoadingColors()
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
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
    this.load(this.data.itemId, { silent: false })
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
