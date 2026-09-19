const { matchSpace, matchLocation } = require('../agent/treeMatch')
const { listItemsCompact } = require('../agent/itemsQuery')
const { buildInventoryPresentation } = require('../agent/presentation')

const id = 'item.search'

async function run(ctx, call, step) {
  const { db, familyId, tree } = ctx
  const space = matchSpace(tree, call.spaceName)
  const loc = matchLocation(space, call.locationName)
  const list = await listItemsCompact(db, familyId, {
    spaceId: space && space.id,
    locationId: loc && loc.id,
    name: String(call.name || call.keyword || '').trim(),
    limit: 40
  })
  const inv = buildInventoryPresentation(list, tree, '查询')
  return {
    ok: true,
    summary: inv.lead,
    inventory: list,
    remember: list.slice(0, 8)
  }
}

module.exports = { id, run }
