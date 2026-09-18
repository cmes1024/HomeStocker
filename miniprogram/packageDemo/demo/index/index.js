Page({
  data: {
    demos: [
      { id: 'system', name: '系统信息', icon: '📱', desc: 'windowInfo / deviceInfo / systemSetting 拆分演示' },
      { id: 'page-router', name: 'pageRouter 通信', icon: '🔗', desc: '组件通过 pageRouter 注册方法，页面统一调用' },
      { id: 'request', name: '请求编排', icon: '📡', desc: 'preTreatment 队列 + requestIdleCallback 空闲调度' },
      { id: 'overlay', name: '浮层组件', icon: '🪟', desc: 'Modal / Loading / maskElement 防抖综合演示' },
      { id: 'worker', name: 'Worker 线程', icon: '⚡', desc: 'Worker 事件发布订阅 + 多任务通信' },
    ]
  },
  goToDemo(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/packageDemo/demo/${id}/index` })
  }
})
