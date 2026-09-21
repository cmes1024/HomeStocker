const { matchSpace } = require('../agent/treeMatch')
const { markTreeDirty, removeSpaceFromTree } = require('../familyTree')

const id = 'space.removeMany'
const MAX = 20

function collectNames(call) {
  if (Array.isArray(call.names) && call.names.length) {
    return call.names.map((n) => String(n || '').trim()).filter(Boolean)
  }
  if (Array.isArray(call.spaces) && call.spaces.length) {
    return call.spaces
      .map((s) => String((s && (s.name || s.spaceName)) || '').trim())
      .filter(Boolean)
  }
  const one = String(call.spaceName || call.name || '').trim()
  return one ? [one] : []
}

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const names = collectNames(call)
  if (names.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删空间至少两个；单个请用 space.remove`
    }
  }
  if (names.length > MAX) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多删 ${MAX} 个空间`
    }
  }

  const spaceIds = []
  const resolved = []
  for (let i = 0; i < names.length; i++) {
    const space = matchSpace(tree, names[i])
    if (!space) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：空间「${names[i]}」不在家庭结构里`
      }
    }
    if (spaceIds.indexOf(space.id) < 0) {
      spaceIds.push(space.id)
      resolved.push(space.name || names[i])
    }
  }
  if (spaceIds.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删空间至少两个不同空间`
    }
  }

  const res = await writers.space.removeMany(
    openid,
    { spaceIds },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '批量删除空间失败'}` }
  }

  spaceIds.forEach((sid) => removeSpaceFromTree(tree, sid))
  markTreeDirty(ctx)

  const preview =
    resolved.length <= 8
      ? resolved.join('、')
      : `${resolved.slice(0, 8).join('、')}等 ${resolved.length} 个`
  const migrated =
    res.data && res.data.migratedToName
      ? `，物资已迁到「${res.data.migratedToName}」`
      : ''
  return {
    ok: true,
    summary: `已删掉空间 ${preview}${migrated}`,
    wrote: true
  }
}

module.exports = { id, run }
