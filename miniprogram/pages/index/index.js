// index.js
Page({
  data: {
    open: false
  },
  onLoad(options) {

  },
  onShow() {
    const auth = this.pageRouter.softAgreementCheck(); // 使用协议软校验
    // const auth = this.pageRouter.forceAgreementCheck(); // 使用协议强校验
    console.log(auth)
    auth && this.agreement_yes()
  },
  agreement_yes() {
    this.pageLoad({
      text: "使用协议校验通过"
    })
  },
  worker() {
    console.log("点击按钮, 启动workers线程")
    wx?._workers?.once('key2', result => {
      console.log("key2的workers事件", result)
    }).post({
      key: "key2",
      fun: "fun1",
      param: {
        age: "10"
      }
    })
  },
  getData() {
    this.pageLoad()
  },
  pageLoad(options = {text: "自定义全局加载"}) {
    this.pageRouter.setLoadingConfig(options)
    this.pageRouter.loading()
    setTimeout(() => {
      this.pageRouter.loaded()
    }, 1000);
  },
  clickOpen(){
    this.setData({
      open: true
    })
  },
  clickoverlay() {
    this.setData({
      open: false
    })
  },
  goToDemo() {
    wx.navigateTo({ url: '/pages/demo/index/index' })
  },
  goToChat() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },
  close() {
    const maskbtn = this.selectComponent("#closebtn");
    setTimeout(() => {
      this.clickoverlay()
      maskbtn.setStatus(false)
    }, 3000)
  }
})
