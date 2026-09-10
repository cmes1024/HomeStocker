// components/maskElement/index.js
// Worklet 防抖控制模块，用于在渲染线程处理事件（替代 WXS）
// const workletHandlers = require('./worklet.worklet.js') // 启用后可在 WXML 中使用 worklet: 绑定
Component({
  /**
   * 组件的属性列表
   */
  externalClasses:['content-class', 'mask-class'],
  behaviors: ['wx://component-export'],
  export() {
    return { setStatus: this.setStatus.bind(this)}
  },
  properties: {
    isPromise: { // 是否通过异步控制防抖开关
      type: Boolean,
      value: false
    },
    promiseMaxTime: { // promise模式下最大的等待时长，防止调用setStatus异常造成卡死
      type: Number,
      value: 20
    },
    time: { // isPromise为false时生效
      type: Number,
      value: 1
    },
    text: {
      type: String,
      value: ''
    },
    opacity: {
      type: Number,
      value: 0.5
    },
    loadAnimation: {
      type: Boolean,
      value: false
    },
    // 通栏按钮：盖掉默认 width:fit-content
    block: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    animation: {
      size: 26,
      backgroundColor: ['var(--promotion-main-color)', 'var(--promotion-second-color)'],
      horizontalOffset: 22
    },
    status: false
  },

  /**
   * 组件的方法列表
   */
  methods: {
    setStatus: function (status) {
      this.setData({
        status: !!status
      })
    }
  }
})