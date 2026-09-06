// component/privacyPopup/index.js
let privacyHandler
let privacyResolves = new Set()
let closeOtherPagePopUpHooks = new Set()

if (wx.onNeedPrivacyAuthorization) {
  wx.onNeedPrivacyAuthorization(resolve => {
    if (typeof privacyHandler === 'function') {
      privacyHandler(resolve)
    }
  })
}

const closeOtherPagePopUp = (closePopUp) => {
  closeOtherPagePopUpHooks.forEach(hook => {
    if (closePopUp !== hook) {
      hook()
    }
  })
}
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    zIndex: {
      type: Number,
      value: 1111111
    },
    disagreeToCloseApp: { // 如果不同意是否需要关闭退出小程序
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    innerShow: false,
    title: "用户隐私保护提示",
    desc1: "感谢您使用本产品，使用前请阅读并同意",
    urlTitle: "《用户隐私保护指引》",
    desc2: "当您点击同意并开始使用产品服务时，即表示您已理解并同意该条款内容，该条款将对您产生法律约束力。如您拒绝，将无法进入产品。",
  },
  lifetimes: {
    attached: function () {
      const closePopUp = () => {
        this.disPopUp()
      }
      privacyHandler = resolve => {
        privacyResolves.add(resolve)
        this.popUp()
        // 额外逻辑：当前页面的隐私弹窗弹起的时候，关掉其他页面的隐私弹窗
        closeOtherPagePopUp(closePopUp)
      }

      closeOtherPagePopUpHooks.add(closePopUp)

      this.closePopUp = closePopUp
    },
    detached: function () {
      closeOtherPagePopUpHooks.delete(this.closePopUp)
    }
  },
  /**
   * 组件的方法列表
   */
  methods: {
    popUp() {
      wx.getPrivacySetting({
        success: res => {
          console.log(res)
          this.setData({
            innerShow: true,
            urlTitle: (res.needAuthorization ? res.privacyContractName : '') || this.data.urlTitle
          })
        },
        fail: () => { },
        complete: () => { },
      })
    },
    disPopUp() {
      this.setData({
        innerShow: false
      })
    },
    readPolicy: function () {
      wx.openPrivacyContract();
    },
    agree(e) {
      this.disPopUp()
      privacyResolves.forEach(resolve => {
        resolve({
          event: 'agree',
          buttonId: 'agree-btn'
        })
      })
      privacyResolves.clear();
      wx.setStorageSync('checkProxy', true);
      this.triggerEvent("agree")
    },
    disagree: function () {
      this.disPopUp()
      privacyResolves.forEach(resolve => {
        resolve({
          event: 'disagree',
        })
      })
      privacyResolves.clear();
      this.data.disagreeToCloseApp ? wx.exitMiniProgram() : this.triggerEvent("disagree");
    },

  }
})
