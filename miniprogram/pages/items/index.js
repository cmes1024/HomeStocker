const { listItems, listSpaces, listItemsBySpace, listExpiringItems } = require('../../utils/db')
const { callSpace } = require('../../utils/cloud')
const { routeByMembership } = require('../../utils/route')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { enrichLedgerItemsAsync } = require('../../utils/runLedgerEnrich')
const { shelfLifeStatus } = require('../../utils/expireStatus')
const copy = require('../../utils/copy')
const { appName } = require('../../config/app')

function pickSpace(spaces, currentId) {
  const list = spaces || []
  if (currentId && list.some((s) => s && s._id === currentId)) {
    return list.find((s) => s._id === currentId)
  }
  return list.find((s) => s && s.isDefault) || list[0] || null
}

Page({
  data: {
    copy: copy.items,
    common: copy.common,
    bootLoading: true,
    bootError: '',
    loading: false,
    error: '',
    items: [],
    expiringItems: [],
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
    bindThemeToPage(this, { headerTitle: appName })
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
    this.setData(this.syncStats({
      membersReady: false,
      itemsReady: false,
      spacesReady: false
    }))
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
      await this.loadSpaces()
      await Promise.all([this.loadList(), this.loadExpiring(), this.loadItemCount()])
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
      this.setData(this.syncStats({
        spaces,
        spaceCount: spaces.length,
        spacesReady: true,
        filterSpaceId: selected ? selected._id : '',
        filterSpaceName: (selected && selected.name) || copy.items.defaultSpaceName
      }))
    } catch (e) {
      this.setData(this.syncStats({
        spaces: [],
        spaceCount: 0,
        spacesReady: true,
        filterSpaceId: '',
        filterSpaceName: copy.items.defaultSpaceName
      }))
    }
  },

  async loadItemCount() {
    const spaces = this.data.spaces || []
    if (!spaces.length) {
      this.setData(this.syncStats({ itemCount: 0, itemsReady: true }))
      return
    }
    try {
      const packs = await Promise.all(
        spaces.map((space) => listItemsBySpace(space._id, { limit: 100 }).catch(() => ({ list: [] })))
      )
      const total = packs.reduce((sum, pack) => sum + ((pack && pack.list && pack.list.length) || 0), 0)
      this.setData(this.syncStats({ itemCount: total, itemsReady: true }))
    } catch (e) {
      this.setData(this.syncStats({ itemCount: 0, itemsReady: true }))
    }
  },

  /**
   * @param {{ silent?: boolean }} [options]
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

  async loadExpiring() {
    try {
      const { list } = await listExpiringItems({ limit: 20 })
      const enriched = (list || []).map((item) => {
        const life = shelfLifeStatus(item.expireDate)
        return {
          ...item,
          expireStatus: life.status,
          expireLabel: life.label
        }
      })
      this.setData({ expiringItems: enriched })
    } catch (e) {
      this.setData({ expiringItems: [] })
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
    this.loadList({ silent: false })
  },

  goAdd() {
    const spaceId = this.data.filterSpaceId || ''
    const qs = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
    wx.navigateTo({ url: `/pages/items/edit${qs}` })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/packageBrowse/items/detail?id=${id}` })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  }
})
