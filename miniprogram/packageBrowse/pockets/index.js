const { listSpaces, listItemsBySpace, listPockets } = require('../../utils/db')
const { bindThemeToPage } = require('../../utils/theme')
const { navigateToItemDetail } = require('../../utils/itemDetailNav')
const copy = require('../../utils/copy')

const FLY_LIMIT = 6
const CLOSE_MS = 380

function stamp(item) {
  const raw = item && (item.createdAt != null ? item.createdAt : item.updatedAt)
  if (raw == null) return 0
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const n = Date.parse(raw.replace(/-/g, '/'))
    return Number.isFinite(n) ? n : 0
  }
  if (typeof raw.getTime === 'function') return raw.getTime()
  return 0
}

function placeLabel(item) {
  const name = item && item.locationName ? String(item.locationName).trim() : ''
  return name || '未写位置'
}

function sortRecent(list) {
  return (list || []).slice().sort((a, b) => stamp(b) - stamp(a))
}

function decorate(items, mode) {
  const fly = mode === 'fly'
  return sortRecent(items).map((item, index) => ({
    _id: item._id,
    name: (item.name && String(item.name).trim()) || '未命名',
    place: placeLabel(item),
    fly: fly && index < FLY_LIMIT,
    settle: fly && index >= FLY_LIMIT,
    delay: fly && index < FLY_LIMIT ? index * 28 : 0
  }))
}

function shouldSkipFlight() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
    const level = info && info.benchmarkLevel
    return typeof level === 'number' && level >= 1 && level < 10
  } catch (e) {
    return false
  }
}

function readLayout() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const menu = wx.getMenuButtonBoundingClientRect()
  const closeTop = menu.top || win.statusBarHeight || 24
  const closeHeight = menu.height || 32
  const trayRestTop = closeTop + closeHeight + 12
  const trayRestLeft = 16
  const trayRestWidth = Math.max(160, (win.windowWidth || 375) - 32)
  const trayRestHeight = 88
  const listTop = trayRestTop + trayRestHeight + 8
  const listHeight = Math.max(160, (win.windowHeight || 667) - listTop - 12)
  return {
    closeTop,
    closeHeight,
    trayRestTop,
    trayRestLeft,
    trayRestWidth,
    trayRestHeight,
    listTop,
    listHeight
  }
}

function styleFromRect(rect) {
  return `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`
}

function styleRest(layout) {
  return `top:${layout.trayRestTop}px;left:${layout.trayRestLeft}px;width:${layout.trayRestWidth}px;height:${layout.trayRestHeight}px;`
}

async function loadPocket(space) {
  const id = space._id
  const fallbackName = (space.name && String(space.name).trim()) || '未命名'
  try {
    const pack = await listItemsBySpace(id, { limit: 100 })
    const items = sortRecent((pack && pack.list) || [])
    const spaceName = pack && pack.space && pack.space.name
    return {
      _id: id,
      name: (spaceName && String(spaceName).trim()) || fallbackName,
      count: items.length,
      capped: items.length >= 100,
      items
    }
  } catch (e) {
    return {
      _id: id,
      name: fallbackName,
      count: 0,
      capped: false,
      items: [],
      error: (e && e.message) || ''
    }
  }
}

function pocketFromPack(pack) {
  const space = (pack && pack.space) || {}
  const items = sortRecent((pack && pack.list) || [])
  const name = (space.name && String(space.name).trim()) || '未命名'
  return {
    _id: space._id,
    name,
    count: items.length,
    capped: !!(pack && pack.capped) || items.length >= 100,
    items
  }
}

Page({
  data: {
    common: copy.common,
    loading: true,
    loadingColors: ['#C4A484', '#C4A484'],
    error: '',
    theme: null,
    headerTitle: '',
    pockets: [],
    phase: 'idle',
    trayClass: '',
    trayStyle: '',
    openId: '',
    openName: '',
    openCount: 0,
    openCapped: false,
    openItems: [],
    closeTop: 24,
    closeHeight: 32,
    listTop: 160,
    listHeight: 400,
    skipFlight: false
  },

  onLoad() {
    this._timers = []
    this._keepOpen = false
    this._fromStyle = ''
    this._restStyle = ''
    this._skipFlight = shouldSkipFlight()
    this._layout = readLayout()
    bindThemeToPage(this, {
      headerTitle: '',
      skipFlight: this._skipFlight,
      closeTop: this._layout.closeTop,
      closeHeight: this._layout.closeHeight
    })
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
    this._layout = readLayout()
    const keep = !!this._keepOpen && !!this.data.openId
    this._keepOpen = false
    this.setData({
      closeTop: this._layout.closeTop,
      closeHeight: this._layout.closeHeight,
      skipFlight: this._skipFlight
    })
    this.load({ keepOpen: keep })
  },

  onHide() {
    if (this._keepOpen) return
    this.forceIdle()
  },

  onUnload() {
    this.clearTimers()
  },

  clearTimers() {
    ;(this._timers || []).forEach((id) => clearTimeout(id))
    this._timers = []
  },

  later(fn, ms) {
    const id = setTimeout(() => {
      this._timers = (this._timers || []).filter((item) => item !== id)
      fn()
    }, ms)
    this._timers = this._timers || []
    this._timers.push(id)
    return id
  },

  idlePatch() {
    return {
      phase: 'idle',
      trayClass: '',
      trayStyle: '',
      openId: '',
      openName: '',
      openCount: 0,
      openCapped: false,
      openItems: []
    }
  },

  forceIdle() {
    this.clearTimers()
    this._fromStyle = ''
    this._restStyle = ''
    if (this.data.phase === 'idle' && !this.data.openId) return
    this.setData(this.idlePatch())
  },

  async load(options = {}) {
    const keepOpen = !!options.keepOpen && !!this.data.openId
    if (!keepOpen) {
      this.setData({ loading: true, error: '' })
    }
    try {
      let pockets
      try {
        const packs = await listPockets({ limit: 100 })
        pockets = (packs || []).map(pocketFromPack)
      } catch (e) {
        if (!(e && e.code === 'UNKNOWN_ACTION')) throw e
        const spaces = await listSpaces()
        pockets = await Promise.all((spaces || []).map((space) => loadPocket(space)))
      }
      const patch = {
        pockets,
        loading: false,
        error: ''
      }
      if (keepOpen) {
        const current = pockets.find((pocket) => pocket._id === this.data.openId)
        if (!current) {
          Object.assign(patch, this.idlePatch())
        } else {
          patch.openName = current.name
          patch.openCount = current.count
          patch.openCapped = current.capped
          patch.openItems = decorate(current.items, 'quiet')
        }
      }
      this.setData(patch)
    } catch (e) {
      this.setData({
        loading: false,
        error: (e && e.message) || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    this.load({ keepOpen: false })
  },

  onPocketTap(e) {
    if (this.data.phase !== 'idle' || this.data.loading) return
    const index = Number(e.currentTarget.dataset.index)
    const pocket = this.data.pockets[index]
    if (!pocket) return
    this.createSelectorQuery()
      .select(`#pocket-${index}`)
      .boundingClientRect((rect) => {
        this.beginOpen(pocket, rect)
      })
      .exec()
  },

  beginOpen(pocket, rect) {
    if (this.data.phase !== 'idle') return
    const layout = this._layout || readLayout()
    const fromStyle = rect && rect.width ? styleFromRect(rect) : styleRest(layout)
    const restStyle = styleRest(layout)
    this._fromStyle = fromStyle
    this._restStyle = restStyle
    this.clearTimers()
    this.setData({
      phase: 'opening',
      trayClass: '',
      trayStyle: fromStyle,
      openId: pocket._id,
      openName: pocket.name,
      openCount: pocket.count,
      openCapped: pocket.capped,
      openItems: decorate(pocket.items, this._skipFlight ? 'quiet' : 'fly'),
      listTop: layout.listTop,
      listHeight: layout.listHeight,
      closeTop: layout.closeTop,
      closeHeight: layout.closeHeight
    })
    this.later(() => {
      if (this.data.phase !== 'opening') return
      this.setData({
        phase: 'open',
        trayClass: 'movable',
        trayStyle: restStyle
      })
    }, this._skipFlight ? 0 : 32)
  },

  onClose() {
    if (this.data.phase === 'idle' || this.data.phase === 'closing') return
    if (this._skipFlight) {
      this.forceIdle()
      return
    }
    this.clearTimers()
    this.setData({
      phase: 'closing',
      trayClass: 'movable',
      trayStyle: this._fromStyle || this.data.trayStyle
    })
    this.later(() => this.forceIdle(), CLOSE_MS)
  },

  onScrim() {
    this.onClose()
  },

  noop() {},

  goItem(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.phase === 'closing') return
    this._keepOpen = true
    const pocket = (this.data.pockets || []).find((p) => p && p._id === this.data.openId)
    const item = pocket && (pocket.items || []).find((it) => it && it._id === id)
    if (!item) {
      navigateToItemDetail(id, {
        fail: () => {
          this._keepOpen = false
        }
      })
      return
    }
    navigateToItemDetail(
      {
        ...item,
        spaceName: item.spaceName || (pocket && pocket.name) || ''
      },
      {
        fail: () => {
          this._keepOpen = false
        }
      }
    )
  }
})
