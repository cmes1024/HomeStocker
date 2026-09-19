function isShortRef(value) {
  return /^[FPR]\d+$/i.test(String(value || '').trim())
}

function compactItem(item, ref, tree) {
  const space = ((tree && tree.spaces) || []).find((s) => s.id === item.spaceId)
  const loc = space && (space.locations || []).find((l) => l.id === item.locationId)
  return {
    ref,
    itemId: item._id,
    name: item.name || '',
    quantity: item.quantity,
    unit: item.unit || '',
    spaceId: item.spaceId || '',
    locationId: item.locationId || '',
    spaceName: (space && space.name) || item.spaceName || '',
    locationName: (loc && loc.name) || item.locationName || '',
    expireDate: item.expireDate || null,
    productionDate: item.productionDate || null,
    note: item.note || '',
    tagIds: item.tagIds || []
  }
}

function renderFocus(row) {
  if (!row) return '无'
  const place = [row.spaceName, row.locationName].filter(Boolean).join(' / ')
  const qty = `${row.quantity == null ? '' : row.quantity}${row.unit || ''}`
  const expire = row.expireDate ? ` · 过期 ${row.expireDate}` : ''
  return `[${row.ref}] ${row.name} ${qty}${place ? ` · ${place}` : ''}${expire}`
}

function renderFocusList(rows) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return '无'
  return list.map((row) => renderFocus(row)).join('\n')
}

function publicRecentItems(rows) {
  const out = []
  const seen = {}
  ;(rows || []).forEach((row) => {
    const itemId = row && (row.itemId || row._id)
    if (!itemId || seen[itemId]) return
    seen[itemId] = true
    out.push({ itemId, name: row.name || '' })
  })
  return out.slice(0, 6)
}

function lookupRef(call, refs) {
  const itemId = String((call && call.itemId) || '').trim()
  if (itemId) {
    const hit = Object.keys(refs)
      .map((k) => refs[k])
      .find((row) => row && row.itemId === itemId)
    if (hit) return hit
    return {
      ref: String((call && call.ref) || '').trim() || 'X',
      itemId,
      name: String((call && call.name) || '').trim(),
      spaceName: '',
      locationName: ''
    }
  }
  const raw = String(call.ref || call.itemRef || '').trim()
  if (isShortRef(raw) && refs[raw.toUpperCase()]) return refs[raw.toUpperCase()]
  const upper = raw.toUpperCase()
  if (isShortRef(upper) && refs[upper]) return refs[upper]
  const name = String(call.name || '').trim()
  if (!name) return null
  const keys = Object.keys(refs)
  const spaceName = String(call.spaceName || '').trim()
  const locationName = String(call.locationName || '').trim()
  return (
    keys
      .map((k) => refs[k])
      .find((row) => {
        if (!row || row.name !== name) return false
        if (spaceName && row.spaceName !== spaceName) return false
        if (locationName && row.locationName !== locationName) return false
        return true
      }) || null
  )
}

function bindCallIds(calls, refs) {
  return (calls || []).map((call) => {
    if (!call || typeof call !== 'object') return call
    if (String(call.use || '').trim() === 'item.merge') {
      const refList = Array.isArray(call.refs)
        ? call.refs
        : call.ref
          ? [call.ref]
          : []
      const itemIds = Array.isArray(call.itemIds) ? call.itemIds.slice() : []
      const names = Array.isArray(call.names) ? call.names.slice() : []
      if (!itemIds.length) {
        refList.forEach((raw) => {
          const row = lookupRef({ ref: raw }, refs)
          if (row && row.itemId && itemIds.indexOf(row.itemId) < 0) {
            itemIds.push(row.itemId)
            names.push(row.name || '')
          }
        })
      }
      return {
        ...call,
        refs: refList,
        itemIds,
        names,
        name: call.name || names[0] || ''
      }
    }
    const row = lookupRef(call, refs)
    if (!row || !row.itemId) return call
    return {
      ...call,
      itemId: row.itemId,
      name: row.name || call.name || '',
      ref: call.ref || row.ref
    }
  })
}

module.exports = {
  isShortRef,
  compactItem,
  renderFocus,
  renderFocusList,
  publicRecentItems,
  lookupRef,
  bindCallIds
}
