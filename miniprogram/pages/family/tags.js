const { callTag } = require('../../utils/cloud')
const { bindThemeToPage, getAppTheme } = require('../../utils/theme')
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

Page({
  data: {
    copy: copy.tags,
    common: copy.common,
    loading: true,
    error: '',
    tags: [],
    acting: false,
    theme: null,
    headerTitle: copy.tags.title,
    editIcon: '',
    deleteIcon: '',
    showModal: false,
    modalMode: 'create',
    modalTitle: copy.tags.createTitle,
    modalName: '',
    editingTagId: '',
    modalError: ''
  },

  onShow() {
    bindThemeToPage(this, {
      headerTitle: copy.tags.title,
      ...themeIcons()
    })
    this.load()
  },

  async load(silent) {
    if (!silent) this.setData({ loading: true, error: '' })
    try {
      const ensured = await callTag('ensureDefaults')
      const list = (ensured && ensured.list) || []
      this.setData({ tags: list, loading: false, error: '' })
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
    if (this.data.acting) return
    this.setData({
      showModal: true,
      modalMode: 'create',
      modalTitle: copy.tags.createTitle,
      modalName: '',
      editingTagId: '',
      modalError: ''
    })
  },

  openRename(e) {
    if (this.data.acting) return
    this.setData({
      showModal: true,
      modalMode: 'rename',
      modalTitle: copy.tags.renameTitle,
      modalName: e.currentTarget.dataset.name || '',
      editingTagId: e.currentTarget.dataset.id || '',
      modalError: ''
    })
  },

  closeModal() {
    if (this.data.acting) return
    this.setData({
      showModal: false,
      modalName: '',
      editingTagId: '',
      modalError: ''
    })
  },

  noop() {},

  onModalName(e) {
    this.setData({ modalName: e.detail.value, modalError: '' })
  },

  async onSaveModal() {
    if (this.data.acting) return
    const name = String(this.data.modalName || '').trim()
    if (!name) {
      this.setData({ modalError: copy.tags.nameRequired })
      return
    }
    this.setData({ acting: true, modalError: '' })
    try {
      if (this.data.modalMode === 'rename') {
        await callTag('update', { tagId: this.data.editingTagId, name })
        wx.showToast({ title: copy.tags.renamedToast, icon: 'success' })
      } else {
        await callTag('create', { name })
        wx.showToast({ title: copy.tags.createdToast, icon: 'success' })
      }
      this.setData({
        showModal: false,
        modalName: '',
        editingTagId: '',
        acting: false
      })
      await this.load(true)
    } catch (e) {
      this.setData({
        acting: false,
        modalError: e.message || copy.common.opFailed
      })
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
      await this.load(true)
    } catch (err) {
      wx.showToast({ title: err.message || copy.common.opFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  }
})
