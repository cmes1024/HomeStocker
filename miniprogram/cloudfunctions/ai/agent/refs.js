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

/** 取短号：优先 ref / itemRef；模型常误写 refs:["P1"]，兼容取首项 */
function pickCallRef(call) {
  const raw = String((call && (call.ref || call.itemRef)) || '').trim()
  if (raw) return raw
  if (Array.isArray(call && call.refs) && call.refs.length) {
    return String(call.refs[0] || '').trim()
  }
  return ''
}

function lookupRef(call, refs) {
  const itemId = String((call && call.itemId) || '').trim()
  if (itemId) {
    const hit = Object.keys(refs)
      .map((k) => refs[k])
      .find((row) => row && row.itemId === itemId)
    if (hit) return hit
    return {
      ref: pickCallRef(call) || 'X',
      itemId,
      name: String((call && call.name) || '').trim(),
      spaceName: '',
      locationName: ''
    }
  }
  const raw = pickCallRef(call)
  if (isShortRef(raw) && refs[raw.toUpperCase()]) return refs[raw.toUpperCase()]
  const upper = raw.toUpperCase()
  if (isShortRef(upper) && refs[upper]) return refs[upper]
  const name = String((call && call.name) || '').trim()
  if (!name) return null
  // spaceName/locationName 在 item.update 里是「改到哪」，不能拿来当「现在在哪」过滤
  const hits = Object.keys(refs)
    .map((k) => refs[k])
    .filter((row) => row && row.name === name)
  if (hits.length === 1) return hits[0]
  const fromSpace = String(
    (call && (call.fromSpaceName || call.sourceSpaceName)) || ''
  ).trim()
  const fromLoc = String(
    (call && (call.fromLocationName || call.sourceLocationName)) || ''
  ).trim()
  if (!fromSpace && !fromLoc) return null
  return (
    hits.find((row) => {
      if (fromSpace && row.spaceName !== fromSpace) return false
      if (fromLoc && row.locationName !== fromLoc) return false
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
  pickCallRef,
  compactItem,
  renderFocus,
  renderFocusList,
  publicRecentItems,
  lookupRef,
  bindCallIds
}
