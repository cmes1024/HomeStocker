const { listItems, listSpaces } = require('../../utils/db')
const { routeByMembership } = require('../../utils/route')
const { callItem } = require('../../utils/cloud')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
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
      bindThemeToPage(this, {
        familyId: session.currentFamilyId,
        familyName,
        headerTitle: '',
        bootLoading: false
      })
      this.syncLoadingColors()
      await this.loadSpaces()
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
      const filterChips = [{ id: '', name: copy.common.all }].concat(
        spaces.map((s) => ({ id: s._id, name: s.name }))
      )
      this.setData({ spaces, filterChips })
    } catch (e) {
      this.setData({
        spaces: [],
        filterChips: [{ id: '', name: copy.common.all }]
      })
    }
  },

  /**
   * @param {{ silent?: boolean }} [options]
   * silent：保留当前列表，拿到新数据再替换（返回编辑页时避免闪动）
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
      const items = await listItems(familyId, {
        spaceId: this.data.filterSpaceId || undefined
      })
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
    // 切筛选时仍静默替换，避免整页闪 loading
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

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/items/edit?id=${id}` })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/index' })
  },

  async onRemove(e) {
    const id = e.currentTarget.dataset.id
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.items.removeTitle,
        content: copy.items.removeContent,
        confirmText: copy.items.removeConfirm,
        confirmColor: '#FA5151',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return
    try {
      await callItem('remove', { itemId: id })
      wx.showToast({ title: copy.items.removedToast, icon: 'success' })
      this.loadList()
    } catch (err) {
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    }
  }
})
