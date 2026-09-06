Page({
  data: {
    logs: [],
    workerReady: false,
  },
  onLoad() {
    if (wx._workers) {
      this.setData({ workerReady: true })
      this.addLog('⚡ Worker 系统已就绪')
    } else {
      this.addLog('⚠ Worker 不可用（wx.createWorker 不支持）')
    }
  },
  // 一次性事件
  sendOnce() {
    const start = Date.now()
    this.addLog('发送一次性任务 key1 → fun1')

    wx._workers.once('key1', result => {
      const elapsed = Date.now() - start
      this.addLog(`✓ key1 返回 (${elapsed}ms): ${result}`)
    })

    wx._workers.post({
      key: 'key1',
      fun: 'fun1',
      param: { name: 'Worker 测试' },
    })
  },
  // 多次订阅同一事件
  sendMulti() {
    this.addLog('发送多订阅任务 key2 → fun2')

    wx._workers.on('key2', result => {
      this.addLog(`✓ key2 订阅者1收到: ${result}`)
    })

    wx._workers.on('key2', result => {
      this.addLog(`✓ key2 订阅者2收到: ${result}`)
    })

    wx._workers.post({
      key: 'key2',
      fun: 'fun2',
      param: { count: 3 },
    })
  },
  // 批量任务
  sendBatch() {
    this.addLog('批量发送 3 个并行 Worker 任务')
    for (let i = 0; i < 3; i++) {
      const key = `batch_${i}`
      wx._workers.once(key, result => {
        this.addLog(`✓ ${key} 返回: ${result}`)
      })
      wx._workers.post({
        key,
        fun: 'fun1',
        param: { index: i },
      })
    }
  },
  addLog(msg) {
    const logs = this.data.logs
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
    this.setData({ logs })
  },
})
