const { lookupRef, matchNamePreferRecent } = require('../agent/refs')

const id = 'item.removeMany'
const MAX_ITEMS = 20

async function run(ctx, call, step) {
  const { writers, openid, refs, familyCtx } = ctx
  let itemIds = Array.isArray(call.itemIds)
    ? call.itemIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  const names = []
  if (!itemIds.length) {
    const refList = Array.isArray(call.refs)
      ? call.refs
      : call.ref
        ? [call.ref]
        : []
    for (let r = 0; r < refList.length; r++) {
      const row = lookupRef({ ref: refList[r] }, refs)
      if (!row || !row.itemId) {
        return {
          ok: false,
          summary: `没法确定要删哪几件，请再说一下物品名称`
        }
      }
      if (itemIds.indexOf(row.itemId) < 0) {
        itemIds.push(row.itemId)
        names.push(row.name || '')
      }
    }
  }
  // 同名冲突：若模型带了更多样的 names，按名重绑（优先 R*）
  const hintNames = Array.isArray(call.names)
    ? call.names.map((n) => String(n || '').trim()).filter(Boolean)
    : []
  const uniqueHints = []
  hintNames.forEach((n) => {
    if (uniqueHints.indexOf(n) < 0) uniqueHints.push(n)
  })
  const uniqueBound = []
  ;(itemIds || []).forEach((id) => {
    const row = lookupRef({ itemId: id }, refs)
    const n = (row && row.name) || ''
    if (n && uniqueBound.indexOf(n) < 0) uniqueBound.push(n)
  })
  if (
    uniqueHints.length >= 2 &&
    (itemIds.length < uniqueHints.length || uniqueBound.length < uniqueHints.length)
  ) {
    itemIds = []
    names.length = 0
    for (let i = 0; i < hintNames.length; i++) {
      const row = matchNamePreferRecent(hintNames[i], refs, itemIds)
      if (!row || !row.itemId) {
        return {
          ok: false,
          summary: `没法对准「${hintNames[i]}」，请再说清楚是哪几件`
        }
      }
      itemIds.push(row.itemId)
      names.push(row.name || hintNames[i])
    }
  }
  if (itemIds.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删除至少需要两件；单件请用 item.remove`
    }
  }
  if (itemIds.length > MAX_ITEMS) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多删 ${MAX_ITEMS} 件`
    }
  }

  const res = await writers.item.removeMany(
    openid,
    {
      itemIds,
      source: 'agent'
    },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '批量删除失败'}` }
  }
  const count = (res.data && res.data.count) || itemIds.length
  const label =
    (Array.isArray(call.names) && call.names.filter(Boolean).length
      ? call.names.filter(Boolean).join('、')
      : null) ||
    (names.filter(Boolean).length ? names.filter(Boolean).join('、') : '') ||
    `${count} 件物品`
  return {
    ok: true,
    summary: `已删掉 ${label}（${count} 件）`,
    wrote: true,
    removedItemIds: itemIds
  }
}

module.exports = { id, run }
