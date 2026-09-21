const { matchTag } = require('../agent/treeMatch')
const { markTreeDirty, removeTagFromTree } = require('../familyTree')

const id = 'tag.remove'

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const name = String(call.name || call.tagName || '').trim()
  if (!name) {
    return { ok: false, summary: `第 ${step} 步失败：缺少标签名称` }
  }
  const tag = matchTag(tree, name)
  if (!tag) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：标签「${name}」不在家庭结构里`
    }
  }
  const res = await writers.tag.removeTag(
    openid,
    { tagId: tag.id },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '删除标签失败'}` }
  }
  removeTagFromTree(tree, tag.id)
  markTreeDirty(ctx)
  return {
    ok: true,
    summary: `已删掉标签「${tag.name || name}」`,
    wrote: true
  }
}

module.exports = { id, run }
