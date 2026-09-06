const formBehr = require("./commonBehrs/formBehr");
const traitBehr = require("./commonBehrs/traitBehr");

module.exports = Behavior({
  behaviors: [
    formBehr,
    traitBehr
  ],
  properties: {},
  data: {
    globalConfig: null
  },
  attached() { },
  methods: {
    // 从缓存获取全局配置
    getConfigByGlobalData() {
      const { config } = getApp().globalData;
      return config
    },
    // 从接口获取全局配置
    async getConfig() {
      
    },

    // 同意使用协议
    agreement_yes() {
      console.info("%c用户同意小程序使用协议!", "color: #1485EE;")
    },

    // 不同意使用协议
    agreement_no() {
      console.info("%c用户拒绝小程序使用协议!", "color: #FA5151")
    },

    // 挂载组件能力到 pageRouter
    // 组件在 ready 钩子中调用：this.registerToRouter({ ... })
    registerComponentMethods(methods) {
      if (this.pageRouter) {
        Object.assign(this.pageRouter, methods)
      } else {
        console.warn("%cpageRouter 不可用，组件方法注册失败", "color: #FA5151")
      }
    }
  }
})
