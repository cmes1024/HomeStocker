const { listItems, listSpaces, loadHomeBoard: fetchHomeBoard, countItems, listExpiringItems } = require('../../utils/db')
const { callSpace } = require('../../utils/cloud')
const { routeByMembership } = require('../../utils/route')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { enrichLedgerItemsAsync } = require('../../utils/runLedgerEnrich')
const { shanghaiTodayYmd, normalizeDateInput } = require('../../utils/expireStatus')
const { navigateToItemDetail } = require('../../utils/itemDetailNav')
const copy = require('../../utils/copy')
const { appName } = require('../../config/app')

function pickSpace(spaces, currentId) {
  const list = spaces || []
  if (currentId && list.some((s) => s && s._id === currentId)) {
    return list.find((s) => s._id === currentId)
  }
  return list.find((s) => s && s.isDefault) || list[0] || null
}

function daysUntilExpire(expireDate, now = Date.now()) {
  const date = normalizeDateInput(expireDate)
  if (!date) return null
  const today = shanghaiTodayYmd(now)
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = date.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function buildExpireBanner(item, spaceName, locationName) {
  if (!item) return null
  const place = [spaceName, locationName].filter(Boolean).join('-')
  const name = String(item.name || '').trim() || '物品'
  const days = daysUntilExpire(item.expireDate)
  let message
  if (days == null) {
    message = place ? `里的${name}即将到期` : `${name}即将到期`
  } else if (days < 0) {
    message = place ? `里的${name}已过期` : `${name}已过期`
  } else if (days === 0) {
    message = place ? `里的${name}将于今天到期` : `${name}将于今天到期`
  } else {
    message = place
      ? `里的${name}将于${days}天后到期`
      : `${name}将于${days}天后到期`
  }
  return { place, message }
}

const FILTER_SPACE_KEY = 'itemsFilterSpaceId'

Page({
  data: {
    copy: copy.items,
    common: copy.common,
    bootLoading: true,
    bootError: '',
    loading: false,
    error: '',
    items: [],
    expireBanner: null,
    familyId: '',
    familyName: '',
    memberCount: 0,
    itemCount: 0,
    spaceCount: 0,
    statsReady: { members: false, items: false, spaces: false },
    headerTitle: appName,
    theme: null,
    spaces: [],
    filterSpaceId: '',
    filterSpaceName: copy.items.defaultSpaceName,
    spaceSheetOpen: false,
    spaceLoading: false,
    pageColHeight: 0,
    animateTiles: true,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: appName })
    let savedSpaceId = ''
    try {
      savedSpaceId = String(wx.getStorageSync(FILTER_SPACE_KEY) || '')
    } catch (e) {
      savedSpaceId = ''
    }
    bindThemeToPage(this, {
      headerTitle: appName,
      ...(savedSpaceId ? { filterSpaceId: savedSpaceId } : {})
    })
    this.syncPageColHeight()
    this.syncLoadingColors()
  },

  syncPageColHeight() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const shellTop = menu.top + menu.height + 8 + 12
      const pageColHeight = Math.max((windowInfo.windowHeight || 0) - shellTop, 0)
      if (pageColHeight && pageColHeight !== this.data.pageColHeight) {
        this.setData({ pageColHeight })
      }
    } catch (e) {
      // keep stylesheet fallback
    }
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
  },

  syncStats(patch = {}) {
    const memberCount = patch.memberCount !== undefined ? patch.memberCount : this.data.memberCount
    const itemCount = patch.itemCount !== undefined ? patch.itemCount : this.data.itemCount
    const spaceCount = patch.spaceCount !== undefined ? patch.spaceCount : this.data.spaceCount
    const prevReady = this.data.statsReady || {}
    const statsReady = {
      members: patch.membersReady !== undefined ? patch.membersReady : prevReady.members,
      items: patch.itemsReady !== undefined ? patch.itemsReady : prevReady.items,
      spaces: patch.spacesReady !== undefined ? patch.spacesReady : prevReady.spaces
    }
    return {
      ...patch,
      memberCount,
      itemCount,
      spaceCount,
      statsReady
    }
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: appName })
    this.syncLoadingColors()
    const hasStats = !!(this.data.statsReady && this.data.statsReady.items)
    if (!hasStats) {
      this.setData(this.syncStats({
        membersReady: false,
        itemsReady: false,
        spacesReady: false
      }))
    }
    try {
      const session = await routeByMembership(this, 'items')
      if (!session || !session.hasFamily) return
      setAppFamily(session.family)
      const familyName = (session.family && session.family.name) || ''
      const memberCount = (session.family && session.family.memberCount) || 0
      bindThemeToPage(this, {
        familyId: session.currentFamilyId,
        familyName,
        headerTitle: appName,
        bootLoading: false,
        ...this.syncStats({ memberCount, membersReady: true })
      })
      this.syncLoadingColors()

      // 空间列表与物资看板解耦：有本地 spaceId 时可并行；看板一次取列表+件数+临期
      const spaceIdHint = this.data.filterSpaceId
      const spacesPromise = this.loadSpaces()
      const boardPromise = (async () => {
        const resolvedSpaceId = spaceIdHint || (await spacesPromise)
        if (!spaceIdHint && resolvedSpaceId && this.data.filterSpaceId !== resolvedSpaceId) {
          this.setData({ filterSpaceId: resolvedSpaceId })
        }
        await this.loadHomeBoard({ spaceId: resolvedSpaceId || this.data.filterSpaceId })
        const finalSpaceId = await spacesPromise
        if (finalSpaceId && finalSpaceId !== (spaceIdHint || resolvedSpaceId)) {
          await this.loadHomeBoard({
            silent: true,
            spaceId: finalSpaceId
          })
        }
      })()
      await Promise.all([spacesPromise, boardPromise])
    } catch (e) {
      // bootError 已设置
    }
  },

  onRetryBoot() {
    this.onShow()
  },

  async loadSpaces() {
    try {
      let spaces = await listSpaces()
      if (!spaces.length) {
        await callSpace('ensureDefault').catch(() => null)
        spaces = await listSpaces()
      }
      const selected = pickSpace(spaces, this.data.filterSpaceId)
      const filterSpaceId = selected ? selected._id : ''
      if (filterSpaceId) {
        try {
          wx.setStorageSync(FILTER_SPACE_KEY, filterSpaceId)
        } catch (e) {
          // ignore
        }
      }
      this.setData(this.syncStats({
        spaces,
        spaceCount: spaces.length,
        spacesReady: true,
        filterSpaceId,
        filterSpaceName: (selected && selected.name) || copy.items.defaultSpaceName
      }))
      return filterSpaceId
    } catch (e) {
      this.setData(this.syncStats({
        spaces: [],
        spaceCount: 0,
        spacesReady: true,
        filterSpaceId: '',
        filterSpaceName: copy.items.defaultSpaceName
      }))
      return ''
    }
  },

  applyExpireBanner(item) {
    if (!item) {
      this.setData({ expireBanner: null })
      return
    }
    const spaceList = this.data.spaces || []
    const space = spaceList.find((s) => s && s._id === item.spaceId)
    const spaceName = item.spaceName || (space && space.name) || ''
    const locationName = item.locationName || ''
    this.setData({ expireBanner: buildExpireBanner(item, spaceName, locationName) })
  },

  /**
   * 首页看板：列表 + 全家件数 + 临期横幅（一次云函数）。
   * @param {{ silent?: boolean, animate?: boolean, spaceId?: string }} [options]
   */
  async loadHomeBoard(options = {}) {
    const familyId = this.data.familyId || getApp().globalData.familyId
    if (!familyId) return

    const hasItems = (this.data.items || []).length > 0
    const silent = options.silent !== undefined ? !!options.silent : hasItems
    const spaceId =
      options.spaceId !== undefined ? options.spaceId : this.data.filterSpaceId

    if (!silent) {
      this.setData({ loading: true, error: '', animateTiles: true })
    } else {
      this.setData({ error: '', animateTiles: !!options.animate })
    }

    try {
      const board = await fetchHomeBoard({
        spaceId: spaceId || undefined
      })
      const items = await enrichLedgerItemsAsync(board.list || [], {}, {}, {})
      this.setData(
        this.syncStats({
          items,
          loading: false,
          itemCount: board.total,
          itemsReady: true
        })
      )
      this.applyExpireBanner(board.expiringTop)
    } catch (e) {
      if (e && e.code === 'UNKNOWN_ACTION') {
        await this.loadHomeBoardLegacy(options)
        return
      }
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  /** 未部署 item.home 时：拆成 list + count + listExpiring */
  async loadHomeBoardLegacy(options = {}) {
    await this.loadList(options)
    try {
      const total = await countItems()
      this.setData(this.syncStats({ itemCount: total, itemsReady: true }))
    } catch (e) {
      this.setData(this.syncStats({ itemsReady: true }))
    }
    try {
      const { list } = await listExpiringItems({ limit: 1 })
      this.applyExpireBanner((list || [])[0])
    } catch (e) {
      this.setData({ expireBanner: null })
    }
  },

  /**
   * @param {{ silent?: boolean, animate?: boolean }} [options]
   */
  async loadList(options = {}) {
    const familyId = this.data.familyId || getApp().globalData.familyId
    if (!familyId) return

    const hasItems = (this.data.items || []).length > 0
    const silent = options.silent !== undefined ? !!options.silent : hasItems

    if (!silent) {
      this.setData({ loading: true, error: '', animateTiles: true })
    } else {
      this.setData({ error: '', animateTiles: !!options.animate })
    }

    try {
      const raw = await listItems(familyId, {
        spaceId: this.data.filterSpaceId || undefined
      })
      const items = await enrichLedgerItemsAsync(raw, {}, {}, {})
      this.setData({ items, loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  openSpaceSheet() {
    this.setData({ spaceSheetOpen: true })
  },

  closeSpaceSheet() {
    this.setData({ spaceSheetOpen: false })
  },

  async onPickSpace(e) {
    const id = e.currentTarget.dataset.id || ''
    const space = (this.data.spaces || []).find((s) => s && s._id === id)
    if (!space) {
      this.setData({ spaceSheetOpen: false })
      return
    }
    if (id === this.data.filterSpaceId) {
      this.setData({ spaceSheetOpen: false })
      return
    }
    try {
      wx.setStorageSync(FILTER_SPACE_KEY, id)
    } catch (err) {
      // ignore
    }
    this.setData({
      spaceSheetOpen: false,
      filterSpaceId: id,
      filterSpaceName: space.name || copy.items.defaultSpaceName,
      spaceLoading: true
    })
    const started = Date.now()
    try {
      await this.loadList({ silent: true, animate: true })
    } finally {
      const wait = 420 - (Date.now() - started)
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
      this.setData({ spaceLoading: false })
    }
  },

  onRetryList() {
    this.loadHomeBoard({ silent: false })
  },

  goAdd() {
    const spaceId = this.data.filterSpaceId || ''
    const qs = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
    wx.navigateTo({ url: `/pages/items/edit${qs}` })
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!id) return
    const item = (this.data.items || []).find((it) => it && it._id === id)
    if (!item) {
      navigateToItemDetail(id)
      return
    }
    const space = (this.data.spaces || []).find((s) => s && s._id === item.spaceId)
    navigateToItemDetail({
      ...item,
      spaceName: item.spaceName || (space && space.name) || ''
    })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  goAssist() {
    wx.navigateTo({
      url: '/packageAiAssist/assist/index',
      fail: () => wx.showToast({ title: copy.assist.openFail, icon: 'none' })
    })
  },

  goMessages() {
    wx.navigateTo({ url: '/pages/family/messages' })
  }
})
