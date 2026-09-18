Page({
  data: {
    logs: [],
    queueStatus: '空闲',
  },
  onLoad() {
    if (typeof wx.ensureLegacyRequestStack === 'function') {
      wx.ensureLegacyRequestStack()
    }
    this.addLog('📡 RequestManager 演示')
    this.addLog('环境: ' + (wx._requestUrl && wx._requestUrl.getEnvStr))
    this.addLog('队列状态: ' + this.data.queueStatus)
  },
  // 模拟：先设置白名单，再发起"关键请求"触发阻塞
  demoWhiteList() {
    wx._requestManager.setWhiteList(['/gateway'])
    this.addLog('设置白名单: /gateway')

    this.addLog('发起普通请求（会被排队）')
    wx._requestManager.preTreatment(
      { url: '/api/other/data' },
      () => this.addLog('✓ 普通请求已释放')
    )

    this.addLog('放行关键请求 preTreatment({ startRequest: true })')
    wx._requestManager.preTreatment(
      { startRequest: true },
      () => this.addLog('✓ 关键请求完成，队列释放')
    )
  },
  // 空闲调度演示
  demoIdle() {
    this.addLog('发起空闲调度请求 (idle)...')
    const start = Date.now()
    wx._requestManager.preTreatment(
      { idle: true, idleTimeout: 5000 },
      () => {
        const elapsed = Date.now() - start
        this.addLog(`✓ 空闲调度回调执行，等待 ${elapsed}ms`)
      }
    )
  },
  // 网络异常提示
  demoErrorTip() {
    const { ErrorTip } = require('../../../utils/common')
    this.addLog('模拟网络异常提示')
    ErrorTip({ errMsg: 'time out' })
    ErrorTip({ msg: 'ERR_TIMED_OUT' })
    ErrorTip({ message: 'Network Error' })
    this.addLog('已触发 3 条网络异常 toast')
  },
  // 请求快速版演示
  demoQuickRequest() {
    this.addLog('请求快速版演示...')
    try {
      wx._requestManager.requestTypesQuick('some.api', {}, { type: 'get' })
    } catch (e) {
      this.addLog(`预期错误（接口不存在）: ${e.message}`)
    }
  },
  addLog(msg) {
    const logs = this.data.logs
    logs.push(msg)
    this.setData({ logs })
  },
})
