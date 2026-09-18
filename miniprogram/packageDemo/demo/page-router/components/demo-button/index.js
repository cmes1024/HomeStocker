// 演示组件：向 pageRouter 注册自身能力
Component({
  properties: {
    label: { type: String, value: 'Demo 按钮' },
    color: { type: String, value: '#007BFF' },
  },
  data: {
    count: 0,
  },
  attached() {
    // 原子组件通过 pageRouter 向页面注册能力
    if (this.pageRouter) {
      Object.assign(this.pageRouter, {
        demoButtonIncrement: this.increment.bind(this),
        demoButtonReset: this.reset.bind(this),
        demoButtonGetCount: () => this.data.count,
      })
      console.log('[pageRouter demo] 组件已注册：increment / reset / getCount')
    } else {
      console.warn('[pageRouter demo] 当前环境无 pageRouter')
    }
  },
  methods: {
    increment() {
      this.setData({ count: this.data.count + 1 })
    },
    reset() {
      this.setData({ count: 0 })
    },
    onTap() {
      // 组件内部触发，也可以通过 pageRouter 从外部触发
      this.increment()
      this.triggerEvent('change', { count: this.data.count })
    },
  },
})
