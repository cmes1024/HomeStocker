/**
 * 清单卡片派生字段（纯计算）：空间名 / 位置名 / 展示行 / 保质期状态。
 * 可供主线程与 Worker 共用。
 */
function shelfLifeFromExpire(expireDate, nowMs) {
  if (!expireDate || typeof expireDate !== 'string') {
    return { expireStatus: '', expireLabel: '' }
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(nowMs || Date.now()))
  const today = `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`
  if (expireDate < today) return { expireStatus: 'expired', expireLabel: '已过期' }
  const [y, m, d] = today.split('-').map(Number)
  const endUtc = Date.UTC(y, m - 1, d) + 3 * 86400000
  const endDt = new Date(endUtc)
  const end = `${endDt.getUTCFullYear()}-${String(endDt.getUTCMonth() + 1).padStart(2, '0')}-${String(endDt.getUTCDate()).padStart(2, '0')}`
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
