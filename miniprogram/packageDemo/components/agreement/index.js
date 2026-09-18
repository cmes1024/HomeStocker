// components/agreement/index.js
// 协议授权状态
// 空状态： 未授权
// 000： 同意
// 时间戳：不同意，并记录时间戳
const passValue = "000"
Component({
  externalClasses: ["ex-wrapper", "ex-loading", "ex-panel", "ex-title", "ex-txt", "ex-btns", "ex-disagree", "ex-agree"],
  /**
   * 组件的属性列表
   */
  properties: {
    saveKey: { // 协议授权标识保存的key值
      type: String,
      value: 'Agreement'
    },
    loading: Boolean, // 是否处于加载状态，为毛玻璃效果
    maskAnimation: Boolean, // 点击按钮是否要显示动画，防抖功能
    themeColor: String, // 背景色
    config: { // 协议的配置信息
      type: Object,
      value: {}
    },
    authorization: { // 微信的授权记录
      type: Object,
      value: {}
    },
    zIndex: { // 层级
      type: Number,
      value: 100
    },
    delayTime: { // 非强制的情况下，要求的间隔弹出时间，单位分钟
      type: Number,
      value: 3
    }
  },
  /**
   * 组件的初始数据
   */
  data: {
    show: false
  },
  attached() {
    if (this.pageRouter) {
      Object.assign(this.pageRouter, {
        softAgreementCheck: this.softCheck.bind(this),
        forceAgreementCheck: this.forceCheck.bind(this)
      });
    } else {
      console.info("%c当前版本无法使用页面路由对象", "color: #FA5151")
    }
  },
  /**
   * 组件的方法列表
   */
  methods: {
    isMillisecondsTimestamp: function (value) {
      // 检查是否为数字
      if (typeof value !== 'number') {
        return false;
      }
      // 检查是否为整数
      if (!Number.isInteger(value)) {
        return false;
      }
      // 检查是否在有效时间戳范围内
      // 有效时间戳范围应该在 0 到 Number.MAX_SAFE_INTEGER 之间
      if (value < 0 || value > Number.MAX_SAFE_INTEGER) {
        return false;
      }
      // 检查通过 new Date(value) 是否能正确返回日期对象
      if (!(new Date(value) instanceof Date)) {
        return false;
      }
      // 检查通过 new Date(value) 得到的日期是否合法
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return false;
      }
      return true;
    },
    // 软校验，从未授权或者不同意授权并达到间隔时间后再次弹出
    softCheck: function () {
      const { saveKey, delayTime } = this.properties;
      if (!saveKey) {
        return true
      }
      const value = wx.getStorageSync(saveKey);
      const status = value == '' || (value != passValue && this.isMillisecondsTimestamp(value) && (new Date().getTime() - value) / 1000 / 60 >= delayTime);
      this.setData({
        show: status
      })
      return !status
    },
    // 强校验，只要没有同意的都会弹出
    forceCheck: function () {
      const { saveKey } = this.properties;
      if (!saveKey) {
        return true
      }
      const status = wx.getStorageSync(saveKey) == passValue;
      this.setData({
        show: !status
      })
      return status
    },
    // 同意协议
    agree: function () {
      const { saveKey } = this.properties;
      wx.setStorageSync(saveKey, passValue);
      this.triggerEvent("agree")
      this.setData({
        show: false
      })
    },
    // 不同意， 仅浏览
    disagree: function () {
      const { saveKey } = this.properties;
      wx.setStorageSync(saveKey, new Date().getTime());
      this.triggerEvent("disagree")
      this.setData({
        show: false
      })
    },
    // 点击隐私协议
    clickAgreement(e) {
      let { item } = e.currentTarget.dataset;
      this.triggerEvent("agreementClick", item);
    }
  }
})