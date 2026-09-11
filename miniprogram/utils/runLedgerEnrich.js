const { enrichLedgerItems } = require('./ledgerEnrich')

/**
 * 通过 Worker 做清单派生；不可用或超时则主线程降级。
 * @returns {Promise<object[]>}
 */
function enrichLedgerItemsAsync(
  items,
  spaceById,
  locationById,
  tagById,
  timeoutMs = 200
) {
  const local = () => enrichLedgerItems(items, spaceById, locationById, tagById)
  const workers = typeof wx !== 'undefined' ? wx._workers : null
  if (!workers || typeof workers.post !== 'function') {
    return Promise.resolve(local())
  }

  return new Promise((resolve) => {
    const key = `enrichLedger_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    let settled = false
    const finish = (data) => {
      if (settled) return
      settled = true
      resolve(Array.isArray(data) ? data : local())
    }
    const timer = setTimeout(() => finish(local()), timeoutMs)
    try {
      workers.once(key, (data) => {
        clearTimeout(timer)
        finish(data)
      })
      workers.post({
        key,
        fun: 'enrichLedgerItems',
        param: { items, spaceById, locationById, tagById }
      })
    } catch (e) {
      clearTimeout(timer)
      finish(local())
    }
  })
}

module.exports = {
  enrichLedgerItemsAsync
}
