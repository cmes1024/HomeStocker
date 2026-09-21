const { matchSpace } = require('../agent/treeMatch')
const { markTreeDirty, removeSpaceFromTree } = require('../familyTree')

const id = 'space.remove'

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const spaceName = String(call.spaceName || call.name || '').trim()
  if (!spaceName) {
    return { ok: false, summary: `第 ${step} 步失败：缺少空间名称` }
  }
  const space = matchSpace(tree, spaceName)
  if (!space) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：空间「${spaceName}」不在家庭结构里`
    }
  }
  const res = await writers.space.removeSpace(
    openid,
    { spaceId: space.id },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '删除空间失败'}` }
  }
  removeSpaceFromTree(tree, space.id)
  markTreeDirty(ctx)
  const migrated =
    res.data && res.data.migratedToName
      ? `，物资已迁到「${res.data.migratedToName}」`
      : ''
  return {
    ok: true,
    summary: `已删掉空间「${space.name || spaceName}」${migrated}`,
    wrote: true
  }
}

module.exports = { id, run }
