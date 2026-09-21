const { matchTag } = require('../agent/treeMatch')
const { markTreeDirty, removeTagFromTree } = require('../familyTree')

const id = 'tag.removeMany'
const MAX = 20

function collectNames(call) {
  if (Array.isArray(call.names) && call.names.length) {
    return call.names.map((n) => String(n || '').trim()).filter(Boolean)
  }
  if (Array.isArray(call.tags) && call.tags.length) {
    return call.tags
      .map((t) => String((t && (t.name || t.tagName)) || (typeof t === 'string' ? t : '')).trim())
      .filter(Boolean)
  }
  const one = String(call.name || call.tagName || '').trim()
  return one ? [one] : []
}

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const names = collectNames(call)
  if (names.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删标签至少两个；单个请用 tag.remove`
    }
  }
  if (names.length > MAX) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多删 ${MAX} 个标签`
    }
  }

  const tagIds = []
  const resolved = []
  for (let i = 0; i < names.length; i++) {
    const tag = matchTag(tree, names[i])
    if (!tag) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：标签「${names[i]}」不在家庭结构里`
      }
    }
    if (tagIds.indexOf(tag.id) < 0) {
      tagIds.push(tag.id)
      resolved.push(tag.name || names[i])
    }
  }
  if (tagIds.length < 2) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：批量删标签至少两个不同标签`
    }
  }

  const res = await writers.tag.removeMany(
    openid,
    { tagIds },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '批量删除标签失败'}` }
  }

  tagIds.forEach((tid) => removeTagFromTree(tree, tid))
  markTreeDirty(ctx)

  const preview =
    resolved.length <= 8
      ? resolved.join('、')
      : `${resolved.slice(0, 8).join('、')}等 ${resolved.length} 个`
  return {
    ok: true,
    summary: `已删掉标签 ${preview}`,
    wrote: true
  }
}

module.exports = { id, run }
