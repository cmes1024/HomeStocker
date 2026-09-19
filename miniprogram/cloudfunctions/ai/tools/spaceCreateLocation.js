const { matchSpace } = require('../agent/treeMatch')
const { markTreeDirty } = require('../familyTree')
const { ensureLocation } = require('./helpers')

const id = 'space.createLocation'

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const space = matchSpace(tree, call.spaceName)
  if (!space) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：空间「${call.spaceName || ''}」不在家庭结构里`
    }
  }
  const locRes = await ensureLocation(
    writers,
    openid,
    tree,
    space,
    call.locationName || call.name,
    { 'space.createLocation': true },
    familyCtx
  )
  if (locRes.error) {
    return { ok: false, summary: `第 ${step} 步失败：${locRes.error.message}` }
  }
  if (locRes.created) markTreeDirty(ctx)
  return {
    ok: true,
    summary: locRes.created
      ? `已在「${space.name}」下新建位置「${locRes.locationName}」`
      : `位置「${locRes.locationName}」已存在`,
    wrote: !!locRes.created
  }
}

module.exports = { id, run }
