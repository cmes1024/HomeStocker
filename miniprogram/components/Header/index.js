// components/Header/index.js
Component({

  /**
   * 组件的属性列表
   */
  styleIsolation: "shared",
  properties: {
    back: {
      type: Boolean,
      value: true
    },
    alignContent: { // title水平对齐方式
      type: String,
      value: "center", // left\center\right
    },
    pageName: String,
    headerStyle: String,
    titleStyle: {
      type: String,
      value: `color: "#333"`
    },
    zIndex: {
      type: Number,
      value: 1
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    bottomDistance: 10,
    proxyConfig: {
      themeColor: "#007BFF",
      policy: {
        title: "隐私协议",
        desc: ["欢迎您使用小程序，请您仔细阅读并充分理解"],
        list: [
          {
            agreementName: "《隐私政策》",
            link: ""
          }
        ]
      },
      btns: {
        disagreenText: "不同意并退出"
      }
    }
  },

  attached() {},

  /**
   * 组件的方法列表
   */
  methods: {
    BackPage: function () {
      var pages = getCurrentPages();
      if (pages.length <= 1) {
        //返回首页
        wx.redirectTo({
          url: '/pages/init/init',
        })
      } else {
        //返回上一级
        wx.navigateBack()
      }
    },
    currentPage: function(){
      const pages = getCurrentPages();
      return pages[pages.length - 1];
    },
    agree: function() {
      this.currentPage()?.agreement_yes?.()
    },
    disagree: function() {
      this.currentPage()?.agreement_no?.()
    },
    agreementClick: function(e) {
      const {detail} = e;
      debugger
    }
  }
})