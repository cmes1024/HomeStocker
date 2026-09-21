const { markTreeDirty, patchTagIntoTree } = require('../familyTree')

const id = 'tag.create'

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const name = String(call.name || call.tagName || '').trim()
  if (!name) {
    return { ok: false, summary: `第 ${step} 步失败：缺少标签名称` }
  }
  const res = await writers.tag.createTag(openid, { name }, { familyCtx })
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '创建标签失败'}` }
  }
  patchTagIntoTree(tree, res.data)
  markTreeDirty(ctx)
  return {
    ok: true,
    summary: `已新建标签「${(res.data && res.data.name) || name}」`,
    wrote: true
  }
}

module.exports = { id, run }
