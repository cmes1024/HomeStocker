const { callSpace } = require('../../utils/cloud')
const { listSpaces } = require('../../utils/db')
const { bindThemeToPage, getAppTheme } = require('../../utils/theme')
const { resolveImageFileID } = require('../../utils/cloudImage')
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
    copy: copy.spaces,
    common: copy.common,
    loading: true,
    loadingColors: ['#C4A484', '#C4A484'],
    error: '',
    spaces: [],
    acting: false,
    theme: null,
    headerTitle: copy.spaces.title,
    editIcon: '',
    deleteIcon: '',
    showModal: false,
    modalMode: 'create',
    modalTitle: copy.spaces.createTitle,
    modalName: '',
    editingId: '',
    modalError: '',
    modalImageFileID: '',
    modalImageLocalPath: '',
    modalImagePreview: '',
    modalImageCleared: false
  },

  onShow() {
    bindThemeToPage(this, {
      headerTitle: copy.spaces.title,
      ...themeIcons()
    })
    this.load()
  },

  async load(silent) {
    if (!silent) this.setData({ loading: true, error: '' })
    try {
      let spaces = await listSpaces()
      if (!spaces.length) {
        await callSpace('ensureDefault')
        spaces = await listSpaces()
      }
      this.setData({ spaces, loading: false, error: '' })
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
      modalTitle: copy.spaces.createTitle,
      modalName: '',
      editingId: '',
      modalError: '',
      modalImageFileID: '',
      modalImageLocalPath: '',
      modalImagePreview: '',
      modalImageCleared: false
    })
  },

  openRename(e) {
    if (this.data.acting) return
    const id = e.currentTarget.dataset.id || ''
    const space = (this.data.spaces || []).find((s) => s && s._id === id)
    const imageFileID = (space && space.imageFileID) || ''
    this.setData({
      showModal: true,
      modalMode: 'rename',
      modalTitle: copy.spaces.renameTitle,
      modalName: e.currentTarget.dataset.name || '',
      editingId: id,
      modalError: '',
      modalImageFileID: imageFileID,
      modalImageLocalPath: '',
      modalImagePreview: imageFileID,
      modalImageCleared: false
    })
  },

  onModalImageChange(e) {
    const path = (e.detail && e.detail.path) || ''
    if (!path) return
    this.setData({
      modalImageLocalPath: path,
      modalImagePreview: path,
      modalImageCleared: false
    })
  },

  onModalImageClear() {
    this.setData({
      modalImageLocalPath: '',
      modalImagePreview: '',
      modalImageCleared: true
    })
  },

  closeModal() {
    if (this.data.acting) return
    this.setData({
      showModal: false,
      modalName: '',
      editingId: '',
      modalError: '',
      modalImageFileID: '',
      modalImageLocalPath: '',
      modalImagePreview: '',
      modalImageCleared: false
    })
  },

  onModalName(e) {
    this.setData({ modalName: e.detail.value, modalError: '' })
  },

  async onSaveModal() {
    if (this.data.acting) return
    const name = String(this.data.modalName || '').trim()
    if (!name) {
      this.setData({
        modalError:
          this.data.modalMode === 'rename'
            ? copy.spaces.renameEmpty
            : copy.spaces.nameRequired
      })
      return
    }
    this.setData({ acting: true, modalError: '' })
    try {
      let imageFileID
      try {
        imageFileID = await resolveImageFileID({
          localPath: this.data.modalImageLocalPath,
          cleared: this.data.modalImageCleared,
          kind: 'space'
        })
      } catch (uploadErr) {
        this.setData({
          acting: false,
          modalError: copy.spaces.imageUploadFailed
        })
        return
      }
      if (this.data.modalMode === 'rename') {
        const payload = { spaceId: this.data.editingId, name }
        if (imageFileID !== undefined) payload.imageFileID = imageFileID
        await callSpace('update', payload)
        wx.showToast({ title: copy.spaces.renamedToast, icon: 'success' })
      } else {
        const payload = { name }
        if (imageFileID) payload.imageFileID = imageFileID
        await callSpace('create', payload)
        wx.showToast({ title: copy.spaces.createdToast, icon: 'success' })
      }
      this.setData({
        showModal: false,
        modalName: '',
        editingId: '',
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
    this.setData({ acting: true })
    try {
      await callSpace('remove', { spaceId: id })
      wx.showToast({ title: copy.spaces.removedToast, icon: 'success' })
      await this.load(true)
    } catch (err) {
      wx.showToast({ title: err.message || copy.spaces.removeFailed, icon: 'none' })
    } finally {
      this.setData({ acting: false })
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || ''
    const qs = name
      ? `id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`
      : `id=${encodeURIComponent(id)}`
    wx.navigateTo({ url: `/packageBrowse/spaces/detail?${qs}` })
  }
})
