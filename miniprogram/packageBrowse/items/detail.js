const { callItem, callSpace } = require('../../utils/cloud')
const { listLocations } = require('../../utils/db')
const { bindThemeToPage } = require('../../utils/theme')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.detail,
    common: copy.common,
    itemId: '',
    item: null,
    spaceName: '',
    locationName: '',
    loading: true,
    error: '',
    removing: false,
    headerTitle: '',
    theme: null,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad(options) {
    const itemId = (options && options.id) || ''
    bindThemeToPage(this, {
      itemId,
      loading: true,
      error: itemId ? '' : copy.detail.missingId,
      headerTitle: ''
    })
    this.syncLoadingColors()
    if (itemId) {
      this.load(itemId, { silent: false })
    } else {
      this.setData({ loading: false })
    }
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
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

      this.setData({
        item,
        spaceName,
        locationName,
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
