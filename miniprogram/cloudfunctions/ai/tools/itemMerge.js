const { lookupRef } = require('../agent/refs')

const id = 'item.merge'

async function run(ctx, call, step) {
  const { writers, openid, refs, familyCtx } = ctx
  let itemIds = Array.isArray(call.itemIds)
    ? call.itemIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
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
          summary: `没法确定要合并哪几件，请再说一下物品名称`
        }
      }
      if (itemIds.indexOf(row.itemId) < 0) itemIds.push(row.itemId)
    }
  }
  if (itemIds.length < 2) {
    return { ok: false, summary: `第 ${step} 步失败：合并至少需要两条物资` }
  }
  const res = await writers.item.mergeItems(
    openid,
    {
      itemIds,
      name: call.name,
      source: 'agent'
    },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '合并失败'}` }
  }
  const keptName = (res.data && res.data.name) || call.name || '物资'
  const qty = res.data && res.data.quantity
  const unit = (res.data && res.data.unit) || ''
  return {
    ok: true,
    summary: `已合并为 ${keptName}${qty != null ? ` ${qty}${unit}` : ''}（${itemIds.length} 条）`,
    wrote: true,
    remember: {
      itemId: res.data && res.data._id,
      name: keptName
    }
  }
}

module.exports = { id, run }
