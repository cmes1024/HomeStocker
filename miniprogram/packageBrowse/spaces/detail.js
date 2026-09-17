const { listItemsBySpace, listLocations } = require('../../utils/db')
const { callSpace } = require('../../utils/cloud')
const { bindThemeToPage, getAppTheme } = require('../../utils/theme')
const { resolveSpaceAtmosphere } = require('../../utils/spaceAtmosphere')
const { enrichLedgerItemsAsync } = require('../../utils/runLedgerEnrich')
const copy = require('../../utils/copy')

const EDIT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
const DELETE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'

function tintSvg(svg, color) {
  const fill = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color || ''))
    ? color
    : '#FF5D00'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.split('#000').join(fill)
  )}`
}

function themeIcons() {
  const theme = getAppTheme()
  const color = (theme && (theme.themeColor || theme.primary)) || '#FF5D00'
  return {
    editIcon: tintSvg(EDIT_SVG, color),
    deleteIcon: tintSvg(DELETE_SVG, color)
  }
}

function locationByIdFrom(list) {
  const map = {}
  ;(list || []).forEach((loc) => {
    if (loc && loc._id) map[loc._id] = loc.name || ''
  })
  return map
}

Page({
  data: {
    copy: copy.spaces,
    common: copy.common,
    spaceId: '',
    space: null,
    items: [],
    locations: [],
    loading: true,
    error: '',
    theme: null,
    headerTitle: '',
    editIcon: '',
    deleteIcon: '',
    atmosphere: {
      bgImage: '',
      lightHeader: false,
      isPhoto: false
    },
    showLocModal: false,
    locModalMode: 'create',
    locEditingId: '',
    locName: '',
    locModalError: '',
    locActing: false,
    loadingText: copy.spaces.detailLoading
  },

  syncAtmosphere(space) {
    const atmosphere = resolveSpaceAtmosphere(space || this.data.space, getAppTheme())
    this.setData({ atmosphere })
    return atmosphere
  },

  onLoad(options) {
    const spaceId = (options && options.id) || ''
    const spaceName = decodeURIComponent((options && options.name) || '').trim()
    const loadingText = spaceName
      ? `${copy.spaces.detailLoadingPrefix}${spaceName}`
      : copy.spaces.detailLoading
    bindThemeToPage(this, {
      spaceId,
      loading: true,
      loadingText,
      headerTitle: spaceName,
      ...themeIcons()
    })
    this.syncAtmosphere(null)
    if (spaceId) {
      this.load(spaceId, { silent: false })
    } else {
      this.setData({ loading: false, error: copy.spaces.missingSpace })
    }
  },

  onShow() {
    bindThemeToPage(this, {
      headerTitle: this.data.headerTitle || (this.data.space && this.data.space.name) || '',
      ...themeIcons()
    })
    this.syncAtmosphere(this.data.space)
    if (this.data.spaceId && !this.data.loading) {
      this.load(this.data.spaceId, { silent: true })
    }
  },

  async load(spaceId, options = {}) {
    const silent = !!options.silent && !!(this.data.space || (this.data.items || []).length)
    if (!silent) {
      this.setData({ loading: true, error: '', spaceId })
    } else {
      this.setData({ error: '', spaceId })
    }
    try {
      const [spacePack, locationList] = await Promise.all([
        listItemsBySpace(spaceId),
        listLocations(spaceId)
      ])
      const space = spacePack.space
      const locations = Array.isArray(locationList) ? locationList : []
      const rawItems = await enrichLedgerItemsAsync(
        spacePack.list || [],
        {},
        locationByIdFrom(locations),
        {}
      )
      const items = rawItems.map((item) => ({
        ...item,
        placeText: `${copy.spaces.locBelongLabel}${
          (item.locationName || '').trim() || copy.detail.locationNone
        }`
      }))
      const atmosphere = resolveSpaceAtmosphere(space, getAppTheme())
      this.setData({
        space,
        items,
        locations,
        loading: false,
        headerTitle: (space && space.name) || this.data.headerTitle || '',
        atmosphere
      })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    this.load(this.data.spaceId, { silent: false })
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/packageBrowse/items/detail?id=${id}` })
  },

  goAdd() {
    const spaceId = this.data.spaceId || ''
    const qs = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
    wx.navigateTo({ url: `/pages/items/edit${qs}` })
  },

  openCreateLoc() {
    this.setData({
      showLocModal: true,
      locModalMode: 'create',
      locEditingId: '',
      locName: '',
      locModalError: '',
      locActing: false
    })
  },

  openRenameLoc(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    this.setData({
      showLocModal: true,
      locModalMode: 'rename',
      locEditingId: id,
      locName: name,
      locModalError: '',
      locActing: false
    })
  },

  closeLocModal() {
    if (this.data.locActing) return
    this.setData({
      showLocModal: false,
      locName: '',
      locModalError: '',
      locEditingId: ''
    })
  },

  onLocName(e) {
    this.setData({ locName: e.detail.value, locModalError: '' })
  },

  async onSaveLoc() {
    if (this.data.locActing) return
    const name = (this.data.locName || '').trim()
    if (!name) {
      this.setData({ locModalError: copy.spaces.locNameRequired })
      return
    }
    const spaceId = this.data.spaceId
    if (!spaceId) return

    this.setData({ locActing: true, locModalError: '' })
    try {
      if (this.data.locModalMode === 'rename') {
        await callSpace('updateLocation', {
          locationId: this.data.locEditingId,
          name
        })
        wx.showToast({ title: copy.spaces.locRenamedToast, icon: 'success' })
      } else {
        await callSpace('createLocation', { spaceId, name })
        wx.showToast({ title: copy.spaces.locCreatedToast, icon: 'success' })
      }
      this.setData({
        showLocModal: false,
        locName: '',
        locEditingId: '',
        locActing: false
      })
      await this.load(spaceId, { silent: true })
    } catch (e) {
      this.setData({
        locActing: false,
        locModalError: e.message || copy.common.opFailed
      })
    }
  },

  async onRemoveLoc(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.spaces.locRemoveTitle,
        content: copy.spaces.locRemoveContent,
        confirmText: copy.spaces.locRemoveConfirm,
        confirmColor: '#FA5151',
        success: (res) => resolve(!!res.confirm)
      })
    })
    if (!confirm) return
    try {
      await callSpace('removeLocation', { locationId: id })
      const next = (this.data.locations || []).filter((l) => l._id !== id)
      this.setData({ locations: next })
      wx.showToast({ title: copy.spaces.locRemovedToast, icon: 'success' })
      await this.load(this.data.spaceId, { silent: true })
    } catch (err) {
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    }
  }
})
