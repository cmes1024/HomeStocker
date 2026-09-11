const { listItems, listSpaces, listLocations } = require('../../utils/db')
const { routeByMembership } = require('../../utils/route')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { buildLocationById } = require('../../utils/ledgerEnrich')
const { enrichLedgerItemsAsync } = require('../../utils/runLedgerEnrich')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.items,
    common: copy.common,
    bootLoading: true,
    bootError: '',
    loading: false,
    error: '',
    items: [],
    familyId: '',
    familyName: '',
    headerTitle: '',
    theme: null,
    spaces: [],
    spaceById: {},
    locationById: {},
    filterSpaceId: '',
    filterChips: [{ id: '', name: copy.common.all }],
    animateTiles: true,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad() {
    bindThemeToPage(this, { headerTitle: '' })
    this.syncLoadingColors()
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: '' })
    this.syncLoadingColors()
    try {
      const session = await routeByMembership(this, 'items')
      if (!session || !session.hasFamily) return
      setAppFamily(session.family)
      const familyName = (session.family && session.family.name) || ''
      const hasSpaces = (this.data.spaces || []).length > 0
      bindThemeToPage(this, {
        familyId: session.currentFamilyId,
        familyName,
        headerTitle: '',
        bootLoading: false
      })
      this.syncLoadingColors()
      // 已有筛选芯片时跳过全量空间重拉，返回详情只静默刷清单
      if (!hasSpaces) {
        await this.loadSpaces()
      }
      await this.loadList()
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
        spaces = []
      }
      const spaceById = {}
      spaces.forEach((s) => {
        if (s && s._id) spaceById[s._id] = s.name || ''
      })
      const locationLists = await Promise.all(
        spaces.map((s) => listLocations(s._id).catch(() => []))
      )
      const locationById = buildLocationById(locationLists)
      const filterChips = [{ id: '', name: copy.common.all }].concat(
        spaces.map((s) => ({ id: s._id, name: s.name }))
      )
      this.setData({ spaces, spaceById, locationById, filterChips })
    } catch (e) {
      this.setData({
        spaces: [],
        spaceById: {},
        locationById: {},
        filterChips: [{ id: '', name: copy.common.all }]
      })
    }
  },

  /**
   * @param {{ silent?: boolean }} [options]
   * silent：保留当前列表，拿到新数据再替换（返回详情页时避免闪动）
   */
  async loadList(options = {}) {
    const familyId = this.data.familyId || getApp().globalData.familyId
    if (!familyId) return

    const hasItems = (this.data.items || []).length > 0
    const silent = options.silent !== undefined ? !!options.silent : hasItems

    if (!silent) {
      this.setData({ loading: true, error: '', animateTiles: true })
    } else {
      this.setData({ error: '', animateTiles: false })
    }

    try {
      const raw = await listItems(familyId, {
        spaceId: this.data.filterSpaceId || undefined
      })
      const items = await enrichLedgerItemsAsync(
        raw,
        this.data.spaceById,
        this.data.locationById
      )
      this.setData({ items, loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  onFilter(e) {
    const id = e.currentTarget.dataset.id || ''
    if (id === this.data.filterSpaceId) return
    this.setData({ filterSpaceId: id })
    this.loadList({ silent: true })
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
