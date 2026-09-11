const { callTag } = require('../../utils/cloud')
const { bindThemeToPage } = require('../../utils/theme')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.tags,
    common: copy.common,
    loading: true,
    error: '',
    tags: [],
    newName: '',
    acting: false,
    theme: null,
    headerTitle: ''
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const ensured = await callTag('ensureDefaults')
      const list = (ensured && ensured.list) || []
      this.setData({ tags: list, loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || copy.common.loadFailed
      })
    }
  },

  onRetry() {
    this.load()
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value })
  },

  async onCreate() {
    if (this.data.acting) return
    const name = (this.data.newName || '').trim()
    if (!name) {
      wx.showToast({ title: copy.tags.nameRequired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callTag('create', { name })
      this.setData({ newName: '' })
      wx.showToast({ title: copy.tags.createdToast, icon: 'success' })
      await this.load()
    } catch (e) {
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  async onRename(e) {
    if (this.data.acting) return
    const id = e.currentTarget.dataset.id
    const current = e.currentTarget.dataset.name || ''
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: copy.tags.renameTitle,
        editable: true,
        placeholderText: copy.tags.createPlaceholder,
        content: current,
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
    if (!res.confirm) return
    const name = String(res.content || '').trim()
    if (!name) {
      wx.showToast({ title: copy.tags.nameRequired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callTag('update', { tagId: id, name })
      wx.showToast({ title: copy.tags.renamedToast, icon: 'success' })
      await this.load()
    } catch (err) {
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  async onRemove(e) {
    if (this.data.acting) return
    const id = e.currentTarget.dataset.id
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.tags.removeTitle,
        content: copy.tags.removeContent,
        confirmText: copy.tags.removeConfirm,
        confirmColor: '#FA5151',
        success: (r) => resolve(r.confirm)
      })
    })
    if (!confirm) return
    this.setData({ acting: true })
    try {
      await callTag('remove', { tagId: id })
      wx.showToast({ title: copy.tags.removedToast, icon: 'success' })
      await this.load()
    } catch (err) {
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  }
})
