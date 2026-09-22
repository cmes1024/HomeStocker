/** 本轮短号仅 F*（关注）/ P*（探查·查询）；无跨轮 R* 袋。 */

function isShortRef(value) {
  return /^[FP]\d+$/i.test(String(value || '').trim())
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
  let touch = ''
  const op = String(row.op || '').trim()
  if (op === 'update' && row.quantityBefore != null && row.quantityAfter != null) {
    touch = ` · 本轮 ${row.quantityBefore}→${row.quantityAfter}`
  } else if (op === 'create') {
    touch = ' · 本轮新开'
  } else if (op === 'update') {
    touch = ' · 本轮改过'
  }
  return `[${row.ref}] ${row.name} ${qty}${place ? ` · ${place}` : ''}${expire}${touch}`
}

function renderFocusList(rows) {
  const list = (rows || []).filter(Boolean)
  if (!list.length) return '无'
  return list.map((row) => renderFocus(row)).join('\n')
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

/** 同名多条时优先本轮 P*（探查/查询），再 F* */
function preferTurnRow(hits) {
  const list = (hits || []).filter((r) => r && r.itemId)
  if (!list.length) return null
  if (list.length === 1) return list[0]
  const probe = list.filter((r) => /^P\d+$/i.test(String(r.ref || '')))
  if (probe.length) {
    probe.sort((a, b) => {
      const na = Number(String(a.ref || '').replace(/\D/g, '')) || 99
      const nb = Number(String(b.ref || '').replace(/\D/g, '')) || 99
      return na - nb
    })
    return probe[0]
  }
  const focus = list.filter((r) => /^F\d+$/i.test(String(r.ref || '')))
  if (focus.length) return focus[0]
  return null
}

function matchNamePreferTurn(name, refs, usedIds) {
  const n = String(name || '').trim()
  if (!n) return null
  const used = usedIds || []
  const hits = Object.keys(refs || {})
    .map((k) => refs[k])
    .filter((row) => row && row.name === n && row.itemId && used.indexOf(row.itemId) < 0)
  return preferTurnRow(hits) || (hits.length === 1 ? hits[0] : null)
}

/**
 * merge / removeMany：短号优先；确认展示名一律来自解析结果，不信模型 names。
 * 若模型 names 更多样，按名重绑并优先本轮 P* / F*。
 */
function bindMultiItemCall(call, refs) {
  const refList = Array.isArray(call.refs)
    ? call.refs
    : call.ref
      ? [call.ref]
      : []
  const hintNames = Array.isArray(call.names)
    ? call.names.map((n) => String(n || '').trim()).filter(Boolean)
    : []
  const itemIds = []
  const names = []

  function pushRow(row) {
    if (!row || !row.itemId) return
    if (itemIds.indexOf(row.itemId) >= 0) return
    itemIds.push(row.itemId)
    names.push(row.name || '')
  }

  function isTurnId(id) {
    const row = lookupRef({ itemId: id }, refs)
    return !!(row && /^[FP]\d+$/i.test(String(row.ref || '')))
  }

  refList.forEach((raw) => {
    pushRow(lookupRef({ ref: raw }, refs))
  })

  if (Array.isArray(call.itemIds)) {
    call.itemIds.forEach((id) => {
      const sid = String(id || '').trim()
      if (!sid) return
      pushRow(lookupRef({ itemId: sid }, refs) || { itemId: sid, name: '' })
    })
  }

  const uniqueHints = []
  hintNames.forEach((n) => {
    if (uniqueHints.indexOf(n) < 0) uniqueHints.push(n)
  })
  const uniqueBound = []
  names.forEach((n) => {
    if (n && uniqueBound.indexOf(n) < 0) uniqueBound.push(n)
  })

  if (uniqueHints.length >= 2 || (itemIds.length < 2 && hintNames.length >= 2)) {
    const altIds = []
    const altNames = []
    let complete = true
    for (let i = 0; i < hintNames.length; i++) {
      const row = matchNamePreferTurn(hintNames[i], refs, altIds)
      if (!row || !row.itemId) {
        complete = false
        break
      }
      altIds.push(row.itemId)
      altNames.push(row.name || hintNames[i])
    }
    if (complete && altIds.length >= 2) {
      const boundSparse = uniqueBound.length < uniqueHints.length || itemIds.length < altIds.length
      const altMoreTurn =
        altIds.every(isTurnId) && itemIds.length > 0 && !itemIds.every(isTurnId)
      if (boundSparse || altMoreTurn || itemIds.length < 2) {
        itemIds.length = 0
        names.length = 0
        altIds.forEach((id, idx) => {
          itemIds.push(id)
          names.push(altNames[idx] || '')
        })
      }
    }
  }

  return {
    ...call,
    refs: refList,
    itemIds,
    names,
    name: names[0] || String(call.name || '').trim() || ''
  }
}

function bindCallIds(calls, refs) {
  return (calls || []).map((call) => {
    if (!call || typeof call !== 'object') return call
    const use = String(call.use || '').trim()
    if (use === 'item.merge' || use === 'item.removeMany') {
      return bindMultiItemCall(call, refs)
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
  lookupRef,
  matchNamePreferTurn,
  bindCallIds
}
