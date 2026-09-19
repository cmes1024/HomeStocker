const { callActivity } = require('../../utils/cloud')
const { bindThemeToPage } = require('../../utils/theme')
const { formatActivityLine } = require('../../utils/activityLine')
const { navigateToItemDetail } = require('../../utils/itemDetailNav')
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

function mapRows(list) {
  return (list || []).map((row) => {
    return {
      _id: row._id,
      line: formatActivityLine(row, copy.messages),
      timeLabel: formatRelativeTime(row.createdAt),
      itemId: row.itemId,
      action: row.action
    }
  })
}

Page({
  data: {
    copy: copy.messages,
    common: copy.common,
    loading: true,
    loadingColors: ['#C4A484', '#C4A484'],
    error: '',
    rows: [],
    theme: null,
    headerTitle: copy.messages.title
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: copy.messages.title })
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await callActivity('list', { limit: 40 })
      const rows = mapRows((res && res.list) || [])
      this.setData({ rows, loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed,
        rows: []
      })
    }
  },

  onRetry() {
    this.load()
  },

  onOpenItem(e) {
    const itemId = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    if (!itemId || action === 'remove') return
    navigateToItemDetail(itemId)
  }
})
