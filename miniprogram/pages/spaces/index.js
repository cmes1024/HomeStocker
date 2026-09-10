const { callSpace } = require('../../utils/cloud')
const { listSpaces } = require('../../utils/db')
const { bindThemeToPage } = require('../../utils/theme')
const copy = require('../../utils/copy')

Page({
  data: {
    copy: copy.spaces,
    common: copy.common,
    loading: true,
    error: '',
    spaces: [],
    theme: null,
    headerTitle: '',
    showCreate: false,
    newName: '',
    renamingId: '',
    renameValue: '',
    acting: false
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
    this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      let spaces = await listSpaces()
      if (!spaces.length) {
        await callSpace('ensureDefault')
        spaces = await listSpaces()
      }
      this.setData({
        spaces,
        loading: false,
        showCreate: false,
        newName: '',
        renamingId: '',
        renameValue: ''
      })
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

  openCreate() {
    this.setData({ showCreate: true, newName: '', renamingId: '' })
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value })
  },

  async onCreate() {
    if (this.data.acting) return
    const name = (this.data.newName || '').trim()
    if (!name) {
      wx.showToast({ title: copy.spaces.nameRequired, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callSpace('create', { name })
      wx.showToast({ title: copy.spaces.createdToast, icon: 'success' })
      await this.load()
    } catch (e) {
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  openRename(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    this.setData({
      renamingId: id,
      renameValue: name,
      showCreate: false
    })
  },

  onRenameInput(e) {
    this.setData({ renameValue: e.detail.value })
  },

  async onRenameSave() {
    if (this.data.acting) return
    const name = (this.data.renameValue || '').trim()
    if (!name) {
      wx.showToast({ title: copy.spaces.renameEmpty, icon: 'none' })
      return
    }
    this.setData({ acting: true })
    try {
      await callSpace('update', {
        spaceId: this.data.renamingId,
        name
      })
      wx.showToast({ title: copy.spaces.renamedToast, icon: 'success' })
      await this.load()
    } catch (e) {
      wx.showToast({ title: e.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  async onRemove(e) {
    const id = e.currentTarget.dataset.id
    const space = (this.data.spaces || []).find((s) => s._id === id)
    if (space && space.isDefault) {
      wx.showToast({ title: copy.spaces.defaultNoRemove, icon: 'none' })
      return
    }
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: copy.spaces.removeTitle,
        content: copy.spaces.removeContent,
        success: (res) => resolve(!!res.confirm)
      })
    })
    if (!confirm) return
    try {
      await callSpace('remove', { spaceId: id })
      wx.showToast({ title: copy.spaces.removedToast, icon: 'success' })
      await this.load()
    } catch (err) {
      wx.showToast({ title: err.message || copy.spaces.removeFailed, icon: 'none' })
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    const qs = name
      ? `id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`
      : `id=${encodeURIComponent(id)}`
    wx.navigateTo({ url: `/pages/spaces/detail?${qs}` })
  }
})
