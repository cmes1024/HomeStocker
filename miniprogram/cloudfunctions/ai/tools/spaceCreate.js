const { markTreeDirty, patchSpaceIntoTree } = require('../familyTree')

const id = 'space.create'

async function run(ctx, call, step) {
  const { writers, openid, familyCtx } = ctx
  const name = String(call.name || call.spaceName || '').trim()
  if (!name) {
    return { ok: false, summary: `第 ${step} 步失败：缺少空间名称` }
  }
  const res = await writers.space.createSpace(
    openid,
    { name },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '创建空间失败'}` }
  }
  const space = res.data || {}
  patchSpaceIntoTree(ctx.tree, space)
  markTreeDirty(ctx)
  return {
    ok: true,
    summary: `已新建空间「${space.name || name}」`,
    wrote: true
  }
}

module.exports = { id, run }
