const { matchSpace, matchLocation } = require('../agent/treeMatch')
const { markTreeDirty, removeLocationFromTree } = require('../familyTree')

const id = 'space.removeLocation'

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const spaceName = String(call.spaceName || '').trim()
  const locationName = String(call.locationName || call.name || '').trim()
  if (!spaceName || !locationName) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：需要空间名和位置名`
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

  const res = await writers.location.removeLocation(
    openid,
    { locationId: loc.id },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '删除位置失败'}` }
  }
  removeLocationFromTree(tree, space.id, loc.id)
  markTreeDirty(ctx)
  return {
    ok: true,
    summary: `已删掉位置「${space.name}/${loc.name || locationName}」`,
    wrote: true
  }
}

module.exports = { id, run }
