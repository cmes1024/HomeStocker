const { listItemsBySpace, listLocations } = require('../../utils/db')
const { callSpace } = require('../../utils/cloud')
const { bindThemeToPage, getAppTheme } = require('../../utils/theme')
const { resolveSpaceAtmosphere } = require('../../utils/spaceAtmosphere')
const copy = require('../../utils/copy')

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
      headerTitle: ''
    })
    this.syncAtmosphere(null)
    if (spaceId) {
      this.load(spaceId, { silent: false })
    } else {
      this.setData({ loading: false, error: copy.spaces.missingSpace })
    }
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
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
      const atmosphere = resolveSpaceAtmosphere(space, getAppTheme())
      this.setData({
        space,
        items: spacePack.list || [],
        locations: Array.isArray(locationList) ? locationList : [],
        loading: false,
        headerTitle: '',
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
    const id = e.currentTarget.dataset.id
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
      // 先本地去掉，避免空态与旧行叠在一起
      const next = (this.data.locations || []).filter((l) => l._id !== id)
      this.setData({ locations: next })
      wx.showToast({ title: copy.spaces.locRemovedToast, icon: 'success' })
      await this.load(this.data.spaceId, { silent: true })
    } catch (err) {
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    }
  }
})
