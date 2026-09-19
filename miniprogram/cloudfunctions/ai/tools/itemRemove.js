const { lookupRef } = require('../agent/refs')

const id = 'item.remove'

async function run(ctx, call, step) {
  const { writers, openid, refs, familyCtx } = ctx
  const row = lookupRef(call, refs)
  if (!row) {
    return { ok: false, summary: `第 ${step} 步失败：找不到要删的物品短号` }
  }
  const res = await writers.item.removeItem(
    openid,
    {
      itemId: row.itemId,
      source: 'agent'
    },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${row.name} — ${res.message}` }
  }
  return {
    ok: true,
    summary: `已删掉 ${row.name}`,
    wrote: true,
    removedItemIds: row.itemId ? [row.itemId] : []
  }
}

module.exports = { id, run }
