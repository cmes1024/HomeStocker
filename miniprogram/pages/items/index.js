const { listItems } = require('../../utils/db')
const { routeByMembership } = require('../../utils/route')
const { callItem } = require('../../utils/cloud')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')

Page({
  data: {
    bootLoading: true,
    bootError: '',
    loading: false,
    error: '',
    items: [],
    familyId: '',
    familyName: '',
    headerTitle: '',
    theme: null
  },

  onLoad() {
    bindThemeToPage(this, { headerTitle: '' })
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: '' })
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
      await this.loadList()
    } catch (e) {
      // bootError 已设置
    }
  },

  onRetryBoot() {
    this.onShow()
  },

  async loadList() {
    const familyId = this.data.familyId || getApp().globalData.familyId
    if (!familyId) return
    this.setData({ loading: true, error: '' })
    try {
      const items = await listItems(familyId)
      this.setData({ items, loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || '加载失败，请重试'
      })
    }
  },

  onRetryList() {
    this.loadList()
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/items/edit' })
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
        title: '从柜子里拿掉？',
        content: '去掉后家人那边也会看不到这件东西。',
        confirmText: '拿掉',
        confirmColor: '#FA5151',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return
    try {
      await callItem('remove', { itemId: id })
      wx.showToast({ title: '已拿掉', icon: 'success' })
      this.loadList()
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }
})
