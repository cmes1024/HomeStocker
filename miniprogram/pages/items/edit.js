const { callItem } = require('../../utils/cloud')
const { bindThemeToPage } = require('../../utils/theme')

Page({
  data: {
    itemId: '',
    name: '',
    quantity: '1',
    note: '',
    loading: false,
    saving: false,
    error: '',
    isEdit: false,
    headerTitle: '',
    theme: null
  },

  onLoad(options) {
    const itemId = (options && options.id) || ''
    const isEdit = !!itemId
    bindThemeToPage(this, {
      itemId,
      isEdit,
      loading: isEdit,
      headerTitle: ''
    })
    if (itemId) {
      this.loadItem(itemId)
    }
  },

  onShow() {
    bindThemeToPage(this, { headerTitle: '' })
  },

  notifyDeletedAndBack() {
    wx.showModal({
      title: '提示',
      content: '商品已被删除',
      showCancel: false,
      success: () => wx.navigateBack()
    })
  },

  async loadItem(itemId) {
    try {
      const item = await callItem('get', { itemId })
      this.setData({
        name: item.name || '',
        quantity: String(item.quantity != null ? item.quantity : 1),
        note: item.note || '',
        loading: false
      })
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
        return
      }
      this.setData({
        loading: false,
        error: e.message || '加载失败'
      })
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },

  onQuantity(e) {
    this.setData({ quantity: e.detail.value })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  async onSave() {
    if (this.data.saving) return
    const name = (this.data.name || '').trim()
    if (!name) {
      this.setData({ error: '先写个名字吧' })
      return
    }
    const quantity = Number(this.data.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      this.setData({ error: '数量好像不对' })
      return
    }
    this.setData({ saving: true, error: '' })
    try {
      const isEdit = this.data.isEdit
      if (isEdit) {
        await callItem('update', {
          itemId: this.data.itemId,
          name,
          quantity,
          note: this.data.note || ''
        })
      } else {
        await callItem('create', {
          name,
          quantity,
          note: this.data.note || '',
          source: 'ui'
        })
      }
      wx.showToast({ title: isEdit ? '已放回' : '已放进柜子', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      if (e.code === 'NOT_FOUND') {
        this.notifyDeletedAndBack()
        return
      }
      this.setData({ error: e.message || '没放进去，再试一次' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
