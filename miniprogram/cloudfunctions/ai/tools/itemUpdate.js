const { matchSpace, resolveTagIds, placeLabel } = require('../agent/treeMatch')
const { lookupRef } = require('../agent/refs')
const { markTreeDirty } = require('../familyTree')
const { ensureLocation } = require('./helpers')

const id = 'item.update'

function fmtQty(q, unit) {
  if (q == null || q === '') return ''
  return `${q}${unit || ''}`
}

function buildUpdateSummary(row, call) {
  // 格式「已改 名（地）：A→B」供 receipts 解析撤销；改文案须同步 receipts.js
  const name = String((row && row.name) || '物资').trim() || '物资'
  const place = placeLabel(row.spaceName, row.locationName)
  const beforeQ = row.quantity
  const afterQ = call.quantity !== undefined ? call.quantity : row.quantity
  const beforeU = row.unit || ''
  const afterU = call.unit !== undefined ? call.unit || '' : beforeU
  const parts = []

  if (call.quantity !== undefined) {
    const before = fmtQty(beforeQ, beforeU)
    const after = fmtQty(afterQ, afterU)
    if (before && after && String(beforeQ) !== String(afterQ)) {
      parts.push(`${before}→${after}`)
    } else if (after) {
      parts.push(`数量 ${after}`)
    }
  }
  if (call.name !== undefined && String(call.name).trim() !== name) {
    parts.push(`改名「${String(call.name).trim()}」`)
  }
  if (call.spaceName || call.locationName) {
    const to = placeLabel(
      call.spaceName || row.spaceName,
      call.locationName !== undefined ? call.locationName : row.locationName
    )
    if (to) parts.push(`挪到 ${to}`)
  }
  if (call.expireDate !== undefined) {
    parts.push(call.expireDate ? `过期 ${call.expireDate}` : '清除过期日')
  }
  if (call.note !== undefined && String(call.note) !== String(row.note || '')) {
    parts.push('备注已更新')
  }
  if (Array.isArray(call.tagNames)) {
    parts.push('标签已更新')
  }

  const detail = parts.length ? parts.join('，') : '已更新'
  return `已改 ${name}${place ? `（${place}）` : ''}：${detail}`
}

async function run(ctx, call, step) {
  const { writers, openid, tree, refs, catalogMap, familyCtx } = ctx
  const row = lookupRef(call, refs)
  if (!row) {
    return {
      ok: false,
      summary: `没法确定要改哪一件，请再说一下物品名称和现在在哪`
    }
  }
  const payload = { itemId: row.itemId, source: 'agent' }
  if (call.name !== undefined) payload.name = call.name
  if (call.quantity !== undefined) payload.quantity = call.quantity
  if (call.unit !== undefined) payload.unit = call.unit
  if (call.note !== undefined) payload.note = call.note
  if (call.expireDate !== undefined) payload.expireDate = call.expireDate
  if (call.productionDate !== undefined) payload.productionDate = call.productionDate
  if (Array.isArray(call.tagNames)) {
    payload.tagIds = resolveTagIds(tree, call.tagNames).tagIds
  }
  const writeOpts = { familyCtx, trustTagIds: Array.isArray(call.tagNames) }
  if (call.spaceName || call.locationName) {
    const space = matchSpace(tree, call.spaceName || row.spaceName)
    if (!space) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里`
      }
    }
    payload.spaceId = space.id
    writeOpts.space = { id: space.id, name: space.name, isDefault: !!space.isDefault }
    if (call.locationName) {
      const locRes = await ensureLocation(
        writers,
        openid,
        tree,
        space,
        call.locationName,
        catalogMap,
        familyCtx
      )
      if (locRes.error) {
        return { ok: false, summary: `第 ${step} 步失败：${locRes.error.message}` }
      }
      payload.locationId = locRes.locationId
      writeOpts.location = locRes.locationId
        ? {
            id: locRes.locationId,
            name: locRes.locationName || call.locationName,
            spaceId: space.id
          }
        : null
      if (locRes.created) markTreeDirty(ctx)
    } else {
      payload.locationId = null
    }
  }
  const res = await writers.item.updateItem(openid, payload, writeOpts)
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${row.name} — ${res.message}` }
  }
  return {
    ok: true,
    summary: buildUpdateSummary(row, call),
    wrote: true,
    remember: {
      itemId: row.itemId,
      name: row.name || '',
      op: 'update',
      quantityBefore: row.quantity,
      quantityAfter: call.quantity !== undefined ? call.quantity : row.quantity
    }
  }
}

module.exports = { id, run, buildUpdateSummary }
