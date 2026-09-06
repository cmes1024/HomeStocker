// components/loading/index.js
// Worklet 动画模块，用于在渲染线程驱动动画（替代 CSS @keyframes）
// require('./worklet.worklet.js') // 启用后可在 WXML 中使用 worklet:animation 绑定
Component({

  /**
   * 组件的属性列表
   */
  externalClasses: ['ex-loading-class'],
  properties: {
    show: Boolean,
    ballSize: {
      type: Number,
      value: 26
    },
    ballColor: {
      type: Array,
      value: ['var(--promotion-main-color)', 'var(--promotion-second-color)']
    },
    offset: {
      type: Number,
      value: 36
    },
    zIndex: {
      type: Number,
      value: 100
    },
    transparent: Boolean,
    glass: {
      type: Boolean,
      value: true
    },
    text: {
      type: String,
      value: "加载中"
    },
    leftBallScales: {
      type: Array,
      value: [1, 0.75, 1, 0.75]
    },
    rightBallScales: {
      type: Array,
      value: [1, 0.75, 1, 0.75]
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
  },
  attached() {
    if (this.pageRouter) {
      Object.assign(this.pageRouter, {
        loading: this.loading.bind(this),
        loaded: this.loaded.bind(this),
        setLoadingConfig: this.setLoadingConfig.bind(this)
      });
    } else {
      console.info("%c当前版本无法使用页面路由对象", "color: #FA5151")
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    loading: function () {
      this.setData({
        show: true
      })
    },
    loaded: function () {
      this.setData({
        show: false
      })
    },
    setLoadingConfig: function (config) {
      this.setData({
        ...this.properties,
        ...config
      })
    }
  }
})