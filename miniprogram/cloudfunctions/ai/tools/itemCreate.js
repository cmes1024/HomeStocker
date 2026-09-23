const { matchSpace, resolveTagIds, placeLabel } = require('../agent/treeMatch')
const { markTreeDirty } = require('../familyTree')
const { ensureLocation } = require('./helpers')

const id = 'item.create'

async function run(ctx, call, step) {
  const { writers, openid, tree, catalogMap, familyCtx } = ctx
  const name = String(call.name || '').trim()
  if (!name) {
    return { ok: false, summary: `第 ${step} 步失败：缺少物品名称` }
  }
  const space = matchSpace(tree, call.spaceName)
  if (!space) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里，未新建空间`
    }
  }
  let locationId = null
  let locationName = ''
  if (String(call.locationName || '').trim()) {
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
    locationId = locRes.locationId
    locationName = locRes.locationName || call.locationName
    if (locRes.created) markTreeDirty(ctx)
  }
  if (call.quantity !== undefined && Number(call.quantity) === 0) {
    return { ok: false, summary: `第 ${step} 步：新开物资数量不能是 0` }
  }
  const tags = resolveTagIds(tree, call.tagNames)
  const payload = {
    name,
    quantity: call.quantity,
    unit: call.unit,
    note: call.note,
    spaceId: space.id,
    locationId,
    tagIds: tags.tagIds,
    expireDate: call.expireDate,
    productionDate: call.productionDate,
    source: 'agent'
  }
  const res = await writers.item.createItem(openid, payload, {
    familyCtx,
    space: { id: space.id, name: space.name, isDefault: !!space.isDefault },
    location: locationId
      ? { id: locationId, name: locationName, spaceId: space.id }
      : null,
    trustTagIds: true
  })
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${name} — ${res.message}` }
  }
  const qty = `${call.quantity == null ? '' : call.quantity}${call.unit || ''}`
  const place = placeLabel(space.name, locationName)
  return {
    ok: true,
    summary: `已记下 ${name}${qty ? ` ${qty}` : ''}${place ? `（${place}）` : ''}`,
    wrote: true,
    remember: {
      itemId: res.data && (res.data._id || res.data.id),
      name,
      op: 'create'
    },
    duplicateCheck: {
      name,
      spaceId: space.id,
      locationId,
      spaceName: space.name,
      locationName
    }
  }
}

module.exports = { id, run }
