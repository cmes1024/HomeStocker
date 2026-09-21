const { matchSpace, matchLocation } = require('../agent/treeMatch')
const { markTreeDirty, removeLocationFromTree } = require('../familyTree')

const id = 'space.removeLocationMany'
const MAX = 20

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const raw = Array.isArray(call.locations) ? call.locations : []
  if (raw.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删位置至少两个；单个请用 space.removeLocation`
    }
  }
  if (raw.length > MAX) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多删 ${MAX} 个位置`
    }
  }

  const locationIds = []
  const labels = []
  const pairs = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] || {}
    const rowStep = i + 1
    const spaceName = String(row.spaceName || '').trim()
    const locationName = String(row.locationName || row.name || '').trim()
    if (!spaceName || !locationName) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：第 ${rowStep} 个位置缺少空间名或位置名`
      }
    }
    const space = matchSpace(tree, spaceName)
    if (!space) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：空间「${spaceName}」不在家庭结构里`
      }
    }
    const loc = matchLocation(space, locationName)
    if (!loc) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：位置「${locationName}」不在「${space.name}」下`
      }
    }
    if (locationIds.indexOf(loc.id) < 0) {
      locationIds.push(loc.id)
      labels.push(`${space.name}/${loc.name || locationName}`)
      pairs.push({ spaceId: space.id, locationId: loc.id })
    }
  }
  if (locationIds.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删位置至少两个不同位置`
    }
  }

  const res = await writers.location.removeLocationMany(
    openid,
    { locationIds },
    { familyCtx }
  )
  if (!res.ok) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：${res.message || '批量删除位置失败'}`
    }
  }

  pairs.forEach((p) => removeLocationFromTree(tree, p.spaceId, p.locationId))
  markTreeDirty(ctx)

  const preview =
    labels.length <= 8
      ? labels.join('、')
      : `${labels.slice(0, 8).join('、')}等 ${labels.length} 个`
  return {
    ok: true,
    summary: `已删掉位置 ${preview}`,
    wrote: true
  }
}

module.exports = { id, run }
