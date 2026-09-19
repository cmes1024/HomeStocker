const DETAIL_URL = '/packageBrowse/items/detail'
const PENDING_TTL_MS = 5000

/**
 * 打开物资详情；有完整行数据时用 eventChannel + globalData 交接快照，避免 URL 塞 JSON。
 * @param {object|string} itemOrId
 * @param {{ fail?: Function, success?: Function, complete?: Function }} [navOptions]
 */
function navigateToItemDetail(itemOrId, navOptions = {}) {
  const item =
    itemOrId && typeof itemOrId === 'object' && itemOrId._id ? itemOrId : null
  const id = item ? String(item._id) : String(itemOrId || '').trim()
  if (!id) return

  if (item) {
    try {
      const app = getApp()
      if (app && app.globalData) {
        app.globalData._pendingItemDetail = { item, at: Date.now() }
      }
    } catch (e) {
      // ignore
    }
  }

  wx.navigateTo({
    url: `${DETAIL_URL}?id=${encodeURIComponent(id)}`,
    success(res) {
      if (item && res.eventChannel && typeof res.eventChannel.emit === 'function') {
        try {
          res.eventChannel.emit('itemSnapshot', { item })
        } catch (e) {
          // ignore
        }
      }
      if (typeof navOptions.success === 'function') navOptions.success(res)
    },
    fail(err) {
      clearPendingItemSnapshot()
      if (typeof navOptions.fail === 'function') navOptions.fail(err)
    },
    complete: navOptions.complete
  })
}

function clearPendingItemSnapshot() {
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData._pendingItemDetail = null
  } catch (e) {
    // ignore
  }
}

/**
 * 消费入口交接的快照（globalData 兜底）。只取一次。
 * @param {string} itemId
 * @returns {object|null}
 */
function takePendingItemSnapshot(itemId) {
  try {
    const app = getApp()
    const pending = app && app.globalData && app.globalData._pendingItemDetail
    if (!pending || !pending.item) return null
    app.globalData._pendingItemDetail = null
    if (itemId && String(pending.item._id) !== String(itemId)) return null
    if (Date.now() - (Number(pending.at) || 0) > PENDING_TTL_MS) return null
    return pending.item
  } catch (e) {
    return null
  }
}

module.exports = {
  navigateToItemDetail,
  takePendingItemSnapshot,
  clearPendingItemSnapshot
}
