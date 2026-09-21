const { matchSpace, resolveTagIds, placeLabel } = require('../agent/treeMatch')
const { markTreeDirty } = require('../familyTree')
const { ensureLocation } = require('./helpers')

const id = 'item.createMany'
const MAX_ITEMS = 20

async function run(ctx, call, step) {
  const { writers, openid, tree, catalogMap, familyCtx } = ctx
  const rawItems = Array.isArray(call.items) ? call.items : []
  if (!rawItems.length) {
    return { ok: false, summary: `第 ${step} 步失败：缺少 items` }
  }
  if (rawItems.length > MAX_ITEMS) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多记 ${MAX_ITEMS} 件`
    }
  }

  const payloads = []
  const spaceHints = {}
  const locationHints = {}
  const labels = []

  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i] || {}
    const rowStep = i + 1
    const name = String(row.name || '').trim()
    if (!name) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：第 ${rowStep} 件缺少物品名称`
      }
    }
    const space = matchSpace(tree, row.spaceName)
    if (!space) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：空间「${row.spaceName || ''}」不在家庭结构里，未新建空间`
      }
    }

    let locationId = null
    let locationName = ''
    if (String(row.locationName || '').trim()) {
      const locRes = await ensureLocation(
        writers,
        openid,
        tree,
        space,
        row.locationName,
        catalogMap,
        familyCtx
      )
      if (locRes.error) {
        return {
          ok: false,
          summary: `第 ${step} 步失败：第 ${rowStep} 件 — ${locRes.error.message}`
        }
      }
      locationId = locRes.locationId
      locationName = locRes.locationName || row.locationName
      if (locRes.created) markTreeDirty(ctx)
    }

    const tags = resolveTagIds(tree, row.tagNames)
    spaceHints[space.id] = {
      id: space.id,
      name: space.name,
      isDefault: !!space.isDefault
    }
    if (locationId) {
      locationHints[locationId] = {
        id: locationId,
        name: locationName,
        spaceId: space.id
      }
    }

    payloads.push({
      name,
      quantity: row.quantity,
      unit: row.unit,
      note: row.note,
      spaceId: space.id,
      locationId,
      tagIds: tags.tagIds,
      expireDate: row.expireDate,
      productionDate: row.productionDate,
      expireReminderEnabled: row.expireReminderEnabled === true,
      source: 'agent'
    })

    const qty = `${row.quantity == null ? '' : row.quantity}${row.unit || ''}`
    const place = placeLabel(space.name, locationName)
    labels.push(
      `${name}${qty ? ` ${qty}` : ''}${place ? `（${place}）` : ''}`
    )
  }

  const res = await writers.item.createMany(
    openid,
    { items: payloads, source: 'agent' },
    {
      familyCtx,
      spaces: spaceHints,
      locations: locationHints,
      trustTagIds: true
    }
  )
  if (!res.ok) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：${res.message || '批量写入失败'}`
    }
  }

  const list = (res.data && res.data.list) || []
  const remember = list.map((row) => ({
    itemId: row._id || row.id,
    name: row.name || '',
    op: 'create'
  }))

  const preview =
    labels.length <= 8
      ? labels.join('、')
      : `${labels.slice(0, 8).join('、')}等 ${labels.length} 件`

  return {
    ok: true,
    summary: `已记下 ${preview}`,
    wrote: true,
    remember,
    batchCount: labels.length
  }
}

module.exports = { id, run }
