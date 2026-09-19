const { listItemsCompact, addDaysYmd } = require('../agent/itemsQuery')
const { buildInventoryPresentation } = require('../agent/presentation')

const id = 'item.listExpiring'

async function run(ctx, call, step) {
  const { db, familyId, tree, todayYmd } = ctx
  const end = addDaysYmd(todayYmd, 3)
  const all = await listItemsCompact(db, familyId, { limit: 100 })
  const list = all
    .filter((item) => item.expireDate && String(item.expireDate) <= end)
    .sort((a, b) => String(a.expireDate).localeCompare(String(b.expireDate)))
    .slice(0, 20)
  const inv = buildInventoryPresentation(list, tree, '临期/过期', '没有临期或过期物品')
  return {
    ok: true,
    summary: inv.lead,
    inventory: list,
    remember: list.slice(0, 8)
  }
}

module.exports = { id, run }
