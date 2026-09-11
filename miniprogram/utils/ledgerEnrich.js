/**
 * 清单卡片派生字段（纯计算）：空间名 / 位置名 / 展示行。
 * 可供主线程与 Worker 共用。
 */
function enrichLedgerItems(items, spaceById, locationById) {
  const spaces = spaceById || {}
  const locations = locationById || {}
  return (items || []).map((item) => {
    const locationName = item.locationId ? locations[item.locationId] || '' : ''
    const spaceName = item.spaceId ? spaces[item.spaceId] || '' : ''
    const placeLine = locationName || spaceName || ''
    return {
      ...item,
      spaceName,
      locationName,
      placeLine
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
  buildLocationById
}
