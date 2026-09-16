const { shanghaiTodayYmd, addDaysYmd } = require('./expireStatus')

/**
 * 清单卡片派生字段（纯计算）：空间名 / 位置名 / 展示行 / 保质期状态。
 * 可供主线程与 Worker 共用。
 */
function shelfLifeFromExpire(expireDate, nowMs) {
  if (!expireDate || typeof expireDate !== 'string') {
    return { expireStatus: '', expireLabel: '' }
  }
  const today = shanghaiTodayYmd(nowMs || Date.now())
  if (expireDate < today) return { expireStatus: 'expired', expireLabel: '已过期' }
  const end = addDaysYmd(today, 3)
  if (expireDate <= end) return { expireStatus: 'expiring', expireLabel: '临期' }
  return { expireStatus: 'normal', expireLabel: '' }
}

function enrichLedgerItems(items, spaceById, locationById, tagById) {
  const spaces = spaceById || {}
  const locations = locationById || {}
  const tags = tagById || {}
  const now = Date.now()
  return (items || []).map((item) => {
    const locationName = item.locationId ? locations[item.locationId] || '' : ''
    const spaceName = item.spaceId ? spaces[item.spaceId] || '' : ''
    const placeLine = locationName || spaceName || ''
    const tagNames = (item.tagIds || [])
      .map((id) => tags[id] || '')
      .filter(Boolean)
    const life = shelfLifeFromExpire(item.expireDate, now)
    return {
      ...item,
      spaceName,
      locationName,
      placeLine,
      tagNames,
      tagLine: tagNames.join(' · '),
      expireStatus: life.expireStatus,
      expireLabel: life.expireLabel
    }
  })
}

function buildLocationById(locationLists) {
  const locationById = {}
  ;(locationLists || []).forEach((locs) => {
    ;(locs || []).forEach((loc) => {
      if (loc && loc._id) locationById[loc._id] = loc.name || ''
    })
  })
  return locationById
}

module.exports = {
  enrichLedgerItems,
  buildLocationById,
  shelfLifeFromExpire
}
