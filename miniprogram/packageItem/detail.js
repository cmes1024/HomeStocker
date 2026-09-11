const { callItem } = require('../utils/cloud')
const { bindThemeToPage } = require('../utils/theme')
const copy = require('../utils/copy')

Page({
  data: {
    copy: copy.itemDetail,
    common: copy.common,
    itemId: '',
    item: null,
    loading: true,
    error: '',
    missing: false,
    theme: null,
    headerTitle: '',
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad(options) {
    const itemId = (options && options.id) || ''
    bindThemeToPage(this, {
      itemId,
      loading: true,
      headerTitle: ''
    })
    this.syncLoadingColors()
    this.loadItem({ silent: false })
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
    this.syncLoadingColors()
    if (this.data.itemId && this.data.item && !this.data.loading) {
      this.loadItem({ silent: true })
    }
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const nextColors = [color, color]
    const prevColors = this.data.loadingColors || []
    if (prevColors[0] === nextColors[0] && prevColors[1] === nextColors[1]) {
      return
    }
    this.setData({ loadingColors: nextColors })
  },

  async loadItem(options = {}) {
    const itemId = this.data.itemId
    if (!itemId) {
      this.setData({
        loading: false,
        error: copy.common.loadFailed,
        missing: false
      })
      return
    }

    const silent = !!options.silent && !!this.data.item
    if (!silent) {
      this.setData({ loading: true, error: '', missing: false })
    } else {
      this.setData({ error: '' })
    }

    try {
      const item = await callItem('get', { itemId })
      this.setData({
        item,
        loading: false,
        missing: false
      })
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        this.setData({
          item: null,
          loading: false,
          error: '',
          missing: true
        })
        return
      }

      this.setData({
        loading: false,
        missing: false,
        error: error.message || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    this.loadItem({ silent: false })
  },

  onEdit() {
    if (!this.data.itemId) return
    wx.navigateTo({
      url: `/pages/items/edit?id=${encodeURIComponent(this.data.itemId)}`
    })
  },

  async onRemove() {
    if (!this.data.itemId) return
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: copy.itemDetail.removeTitle,
        content: copy.itemDetail.removeContent,
        confirmText: copy.itemDetail.removeConfirm,
        confirmColor: '#FA5151',
        success: (res) => resolve(!!res.confirm)
      })
    })
    if (!confirmed) return

    try {
      await callItem('remove', { itemId: this.data.itemId })
      wx.showToast({ title: copy.itemDetail.removedToast, icon: 'success' })
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/items/index' })
      }, 300)
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        wx.reLaunch({ url: '/pages/items/index' })
        return
      }
      wx.showToast({ title: error.message || copy.common.opFailed, icon: 'none' })
    }
  }
})
