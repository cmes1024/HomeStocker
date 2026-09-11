// 版本库2.18.1开始支持
const functions = {
  fun1: (param) => {
    let list = new Array(500).fill(1)
    list.map(() => console.log(new Date().getTime()))
    return `来自worker线程fun1函数的处理： ${JSON.stringify(param)}`
  },
  fun2: (param) => {
    return `来自worker线程fun2函数的处理： ${JSON.stringify(param)}`
  },
  /**
   * 清单卡片派生（纯计算）。Worker 内不能 require 主包模块，逻辑内联。
   */
  enrichLedgerItems: (param) => {
    const items = (param && param.items) || []
    const spaceById = (param && param.spaceById) || {}
    const locationById = (param && param.locationById) || {}
    return items.map((item) => {
      const locationName = item.locationId ? locationById[item.locationId] || '' : ''
      const spaceName = item.spaceId ? spaceById[item.spaceId] || '' : ''
      const placeLine = locationName || spaceName || ''
      return Object.assign({}, item, {
        spaceName,
        locationName,
        placeLine
      })
    })
  }
}

/**
 * 监听worker
 */
worker.onMessage(({ key, fun, param }) => {
  let data = functions?.[fun]?.(param)
  worker.postMessage({ key, data })
})
