Page({
  data: {
    modalOpen: false,
    maskBtnDisabled: false,
    maskBtnText: '防抖按钮（快速点我）',
  },
  onShow() {
    if (this.pageRouter) {
      this.pageRouter.setLoadingConfig({
        text: '通过 pageRouter 控制',
        ballColor: ['#007BFF', '#05D267'],
      })
    }
  },
  // Loading 控制
  showLoading() {
    this.pageRouter?.loading()
    setTimeout(() => {
      this.pageRouter?.loaded()
      wx.showToast({ title: '加载完成', icon: 'none' })
    }, 2000)
  },
  // Modal
  openModal() {
    this.setData({ modalOpen: true })
  },
  closeModal() {
    this.setData({ modalOpen: false })
  },
  // maskElement 防抖
  onMaskAction() {
    wx.showToast({ title: '按钮点击生效', icon: 'none' })
  },
})
