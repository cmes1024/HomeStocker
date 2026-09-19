const { matchSpace, resolveTagIds } = require('../agent/treeMatch')
const { lookupRef } = require('../agent/refs')
const { touchFamilyTree } = require('../familyTree')
const { ensureLocation } = require('./helpers')

const id = 'item.update'

async function run(ctx, call, step) {
  const { writers, openid, db, familyId, tree, refs, catalogMap, familyCtx } = ctx
  let currentTree = tree
  const row = lookupRef(call, refs)
  if (!row) {
    return { ok: false, summary: `第 ${step} 步失败：找不到要改的物品短号` }
  }
  const payload = { itemId: row.itemId, source: 'agent' }
  if (call.name !== undefined) payload.name = call.name
  if (call.quantity !== undefined) payload.quantity = call.quantity
  if (call.unit !== undefined) payload.unit = call.unit
  if (call.note !== undefined) payload.note = call.note
  if (call.expireDate !== undefined) payload.expireDate = call.expireDate
  if (call.productionDate !== undefined) payload.productionDate = call.productionDate
  if (Array.isArray(call.tagNames)) {
    payload.tagIds = resolveTagIds(currentTree, call.tagNames).tagIds
  }
  const writeOpts = { familyCtx, trustTagIds: Array.isArray(call.tagNames) }
  if (call.spaceName || call.locationName) {
    const space = matchSpace(currentTree, call.spaceName || row.spaceName)
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
        currentTree,
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
      if (locRes.created) {
        currentTree = (await touchFamilyTree(db, familyId)) || currentTree
        ctx.tree = currentTree
      }
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
    summary: `已修改 ${row.name}`,
    wrote: true,
    remember: row
  }
}

module.exports = { id, run }
