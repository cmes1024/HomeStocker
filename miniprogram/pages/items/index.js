const { listItems, listSpaces, listLocations, listExpiringItems } = require('../../utils/db')
const { callTag } = require('../../utils/cloud')
const { routeByMembership } = require('../../utils/route')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { buildLocationById } = require('../../utils/ledgerEnrich')
const { enrichLedgerItemsAsync } = require('../../utils/runLedgerEnrich')
const { shelfLifeStatus } = require('../../utils/expireStatus')
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
    expiringItems: [],
    familyId: '',
    familyName: '',
    headerTitle: '',
    theme: null,
    spaces: [],
    spaceById: {},
    locationById: {},
    tagById: {},
    tags: [],
    filterSpaceId: '',
    filterTagId: '',
    filterChips: [{ id: '', name: copy.common.all }],
    tagChips: [{ id: '', name: copy.items.filterAllTags }],
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
      if (!hasSpaces) {
        await this.loadSpaces()
      }
      await this.loadTags()
      await Promise.all([this.loadList(), this.loadExpiring()])
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

  async loadTags() {
    try {
      const ensured = await callTag('ensureDefaults')
      const tags = (ensured && ensured.list) || []
      const tagById = {}
      tags.forEach((t) => {
        if (t && t._id) tagById[t._id] = t.name || ''
      })
      const tagChips = [{ id: '', name: copy.items.filterAllTags }].concat(
        tags.map((t) => ({ id: t._id, name: t.name }))
      )
      this.setData({ tags, tagById, tagChips })
    } catch (e) {
      this.setData({
        tags: [],
        tagById: {},
        tagChips: [{ id: '', name: copy.items.filterAllTags }]
      })
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
      this.setData({ error: '', animateTiles: false })
    }

    try {
      const raw = await listItems(familyId, {
        spaceId: this.data.filterSpaceId || undefined,
        tagId: this.data.filterTagId || undefined
      })
      const items = await enrichLedgerItemsAsync(
        raw,
        this.data.spaceById,
        this.data.locationById,
        this.data.tagById
      )
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

  onFilter(e) {
    const id = e.currentTarget.dataset.id || ''
    if (id === this.data.filterSpaceId) return
    this.setData({ filterSpaceId: id })
    this.loadList({ silent: true })
  },

  onFilterTag(e) {
    const id = e.currentTarget.dataset.id || ''
    if (id === this.data.filterTagId) return
    this.setData({ filterTagId: id })
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
