const { matchSpace, matchLocation } = require('../agent/treeMatch')
const { listItemsCompact, resultCapFor } = require('../agent/itemsQuery')
const { buildInventoryPresentation } = require('../agent/presentation')

const id = 'item.search'

async function run(ctx, call, step) {
  const { db, familyId, tree } = ctx
  const space = matchSpace(tree, call.spaceName)
  const loc = matchLocation(space, call.locationName)
  const keyword = String(call.name || call.keyword || '').trim()
  const queryOpts = {
    spaceId: space && space.id,
    locationId: loc && loc.id,
    keyword,
    name: keyword
  }
  const list = await listItemsCompact(db, familyId, queryOpts)
  const capped = list.slice(0, resultCapFor(queryOpts))
  const inv = buildInventoryPresentation(capped, tree, '查询')
  return {
    ok: true,
    summary: inv.lead,
    inventory: capped
  }
}

module.exports = { id, run }
