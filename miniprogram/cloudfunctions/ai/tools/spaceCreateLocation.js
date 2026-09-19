const { matchSpace } = require('../agent/treeMatch')
const { touchFamilyTree } = require('../familyTree')
const { ensureLocation } = require('./helpers')

const id = 'space.createLocation'

async function run(ctx, call, step) {
  const { writers, openid, db, familyId, tree, familyCtx } = ctx
  let currentTree = tree
  const space = matchSpace(currentTree, call.spaceName)
  if (!space) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里`
    }
  }
  const locRes = await ensureLocation(
    writers,
    openid,
    currentTree,
    space,
    call.locationName || call.name,
    { 'space.createLocation': true },
    familyCtx
  )
  if (locRes.error) {
    return { ok: false, summary: `第 ${step} 步失败：${locRes.error.message}` }
  }
  if (locRes.created) {
    currentTree = (await touchFamilyTree(db, familyId)) || currentTree
    ctx.tree = currentTree
  }
  return {
    ok: true,
    summary: locRes.created
      ? `已在「${space.name}」下新建位置「${locRes.locationName}」`
      : `位置「${locRes.locationName}」已存在`,
    wrote: !!locRes.created
  }
}

module.exports = { id, run }
