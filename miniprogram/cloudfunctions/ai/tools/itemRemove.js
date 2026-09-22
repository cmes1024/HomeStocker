const { placeLabel } = require('../agent/treeMatch')
const { lookupRef } = require('../agent/refs')

const id = 'item.remove'

async function run(ctx, call, step) {
  const { writers, openid, refs, familyCtx } = ctx
  const row = lookupRef(call, refs)
  if (!row) {
    return {
      ok: false,
      summary: `没法确定要删哪一件，请再说一下物品名称和现在在哪`
    }
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
  const qty = `${row.quantity == null ? '' : row.quantity}${row.unit || ''}`
  const place = placeLabel(row.spaceName, row.locationName)
  let summary = `已删掉 ${row.name || '物资'}`
  if (qty) summary += ` ${qty}`
  if (place) summary += `（${place}）`
  return {
    ok: true,
    summary,
    wrote: true
  }
}

module.exports = { id, run }
