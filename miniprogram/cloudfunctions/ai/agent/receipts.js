/**
 * 从助手回执文案解析数量变更（我们自己的 summary 格式，不是用户话术路由）。
 * 例：已改 大米（厨房）：5→8
 */

function parseQtyChangeReceiptsFromText(text) {
  const raw = String(text || '')
  if (!raw || raw.indexOf('已改') < 0 || raw.indexOf('→') < 0) return []
  const out = []
  const seen = {}
  const re =
    /已改\s+([^\n：:（(]+?)(?:\s*[（(]([^）)]+)[）)])?\s*[：:\s]+([^\s→\-,，；;]+)\s*→\s*([^\s\n，,；;]+)/g
  let m
  while ((m = re.exec(raw))) {
    const name = String(m[1] || '').trim()
    const place = String(m[2] || '').trim()
    const before = String(m[3] || '').trim()
    const after = String(m[4] || '').trim()
    if (!name || !before || !after) continue
    const key = `${name}|${place}|${before}|${after}`
    if (seen[key]) continue
    seen[key] = true
    const spaceName = place.split(/[\/／]/)[0] || ''
    const locationName = place.split(/[\/／]/).slice(1).join('/') || ''
    out.push({
      name,
      place,
      spaceName,
      locationName,
      before,
      after,
      beforeNum: parseFloat(before),
      afterNum: parseFloat(after)
    })
  }
  return out
}

/** 取最近一条含数量变更回执的助手发言 */
function parseLatestQtyChangeReceipts(history) {
  const rows = history || []
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (!row || row.role !== 'assistant') continue
    const hits = parseQtyChangeReceiptsFromText(row.text)
    if (hits.length) return hits
  }
  return []
}

/**
 * 回执恢复探查：优先按物资名（+ 空间），避免无谓 listAll。
 * 多件同名空间不同时用 names[]，由 runProbe 按关键词并集过滤。
 */
function probeFromReceipts(receipts) {
  const list = receipts || []
  if (!list.length) return { listAll: true }

  const names = []
  list.forEach((r) => {
    const n = String(r.name || '').trim()
    if (n && names.indexOf(n) < 0) names.push(n)
  })
  if (!names.length) return { listAll: true }

  if (names.length === 1) {
    const row = list[0] || {}
    return {
      name: names[0],
      spaceName: String(row.spaceName || '').trim(),
      locationName: String(row.locationName || '').trim()
    }
  }

  const spaces = []
  list.forEach((r) => {
    const s = String(r.spaceName || '').trim()
    if (s && spaces.indexOf(s) < 0) spaces.push(s)
  })
  if (spaces.length === 1) {
    return { names, spaceName: spaces[0] }
  }
  return { names }
}

function qtyEquals(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  const na = parseFloat(a)
  const nb = parseFloat(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return String(a) === String(b)
}

function callCoversReceipt(call, receipt, refs) {
  if (!call || !receipt) return false
  if (String(call.use || '').trim() !== 'item.update') return false
  if (call.quantity === undefined) return false
  const row =
    refs && typeof refs === 'object'
      ? Object.keys(refs)
          .map((k) => refs[k])
          .find((r) => r && (r.ref === call.ref || r.itemId === call.itemId))
      : null
  const name = String((row && row.name) || call.name || '').trim()
  if (name !== receipt.name) return false
  return qtyEquals(call.quantity, receipt.before) || qtyEquals(call.quantity, receipt.beforeNum)
}

function findProbeRowForReceipt(receipt, probedRows) {
  const rows = (probedRows || []).filter((row) => row && row.name === receipt.name)
  if (!rows.length) return null
  if (rows.length === 1) return rows[0]
  const byAfter = rows.find((row) => qtyEquals(row.quantity, receipt.afterNum) || qtyEquals(row.quantity, receipt.after))
  if (byAfter) return byAfter
  if (receipt.spaceName) {
    const byPlace = rows.filter((row) => row.spaceName === receipt.spaceName)
    if (byPlace.length === 1) return byPlace[0]
    const byBoth = byPlace.find(
      (row) => qtyEquals(row.quantity, receipt.afterNum) || qtyEquals(row.quantity, receipt.after)
    )
    if (byBoth) return byBoth
  }
  return null
}

/**
 * 同一条助手回执改了多件，计划只回滚了其中几件 → 补全其余（机器回执，非用户词路由）。
 * 若用户话里只点名了一件回执物资，则不补（避免「只改回大米」被扩成全改）。
 */
function completePartialReceiptRollbacks(plan, receipts, refs, probedRows, userText) {
  const list = receipts || []
  if (!plan || list.length < 2) return plan
  const calls = Array.isArray(plan.calls) ? plan.calls : []
  const named = list.filter((r) => String(userText || '').indexOf(r.name) >= 0)
  if (named.length === 1) return plan

  let rollbackHits = 0
  list.forEach((r) => {
    if (calls.some((c) => callCoversReceipt(c, r, refs))) rollbackHits += 1
  })
  if (rollbackHits < 1) return plan
  if (rollbackHits >= list.length) return plan

  const next = calls.slice()
  list.forEach((r) => {
    if (next.some((c) => callCoversReceipt(c, r, refs))) return
    const hit = findProbeRowForReceipt(r, probedRows)
    if (!hit || !hit.ref) return
    const quantity = Number.isFinite(r.beforeNum) ? r.beforeNum : r.before
    next.push({
      use: 'item.update',
      ref: hit.ref,
      name: hit.name || r.name,
      quantity
    })
    if (refs && hit.ref) refs[hit.ref] = hit
  })
  plan.calls = next
  return plan
}

module.exports = {
  parseQtyChangeReceiptsFromText,
  parseLatestQtyChangeReceipts,
  probeFromReceipts,
  qtyEquals,
  callCoversReceipt,
  findProbeRowForReceipt,
  completePartialReceiptRollbacks
}
