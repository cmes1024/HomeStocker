Page({
  data: {
    countFromPage: 0,
    logs: [],
  },
  onShow() {
    this.addLog('页面 onShow — 检查 pageRouter 是否可用')
    if (this.pageRouter) {
      this.addLog('✓ pageRouter 可用')
    }
  },
  // 通过 pageRouter 调用组件方法
  pageIncrement() {
    this.addLog('页面调用：this.pageRouter.demoButtonIncrement()')
    this.pageRouter.demoButtonIncrement()
    const c = this.pageRouter.demoButtonGetCount()
    this.addLog(`  → 当前计数值: ${c}`)
    this.setData({ countFromPage: c })
  },
  pageReset() {
    this.addLog('页面调用：this.pageRouter.demoButtonReset()')
    this.pageRouter.demoButtonReset()
    this.setData({ countFromPage: 0 })
    this.addLog('  → 已归零')
  },
  // 组件事件回调
  onBtnChange(e) {
    const { count } = e.detail
    this.setData({ countFromPage: count })
    this.addLog(`组件触发 change 事件，count = ${count}`)
  },
  // 演示 loading 也通过 pageRouter 控制
  showLoading() {
    this.addLog('页面调用：this.pageRouter.loading()')
    this.pageRouter.setLoadingConfig({
      text: 'pageRouter 控制加载',
      ballColor: ['#007BFF', '#05D267'],
    })
    this.pageRouter.loading()
    setTimeout(() => {
      this.pageRouter.loaded()
      this.addLog('→ 加载结束')
    }, 1500)
  },
  addLog(msg) {
    const logs = this.data.logs
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
    this.setData({ logs })
  },
})
