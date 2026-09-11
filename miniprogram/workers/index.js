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
    const tagById = (param && param.tagById) || {}
    const now = Date.now()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date(now))
    const today = `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`
    const [ty, tm, td] = today.split('-').map(Number)
    const endDt = new Date(Date.UTC(ty, tm - 1, td) + 3 * 86400000)
    const end = `${endDt.getUTCFullYear()}-${String(endDt.getUTCMonth() + 1).padStart(2, '0')}-${String(endDt.getUTCDate()).padStart(2, '0')}`
    return items.map((item) => {
      const locationName = item.locationId ? locationById[item.locationId] || '' : ''
      const spaceName = item.spaceId ? spaceById[item.spaceId] || '' : ''
      const placeLine = locationName || spaceName || ''
      const tagNames = (item.tagIds || [])
        .map((id) => tagById[id] || '')
        .filter(Boolean)
      let expireStatus = ''
      let expireLabel = ''
      const expireDate = item.expireDate
      if (expireDate && typeof expireDate === 'string') {
        if (expireDate < today) {
          expireStatus = 'expired'
          expireLabel = '已过期'
        } else if (expireDate <= end) {
          expireStatus = 'expiring'
          expireLabel = '临期'
        } else {
          expireStatus = 'normal'
        }
      }
      return Object.assign({}, item, {
        spaceName,
        locationName,
        placeLine,
        tagNames,
        tagLine: tagNames.join(' · '),
        expireStatus,
        expireLabel
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
