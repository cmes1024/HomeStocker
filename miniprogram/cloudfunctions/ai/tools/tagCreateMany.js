const { markTreeDirty, patchTagIntoTree } = require('../familyTree')

const id = 'tag.createMany'
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
      summary: `第 ${step} 步失败：批量建标签至少两个；单个请用 tag.create`
    }
  }
  if (names.length > MAX) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多建 ${MAX} 个标签`
    }
  }

  const res = await writers.tag.createMany(
    openid,
    { tags: names.map((name) => ({ name })) },
    { familyCtx }
  )
  if (!res.ok) {
    return { ok: false, summary: `第 ${step} 步失败：${res.message || '批量创建标签失败'}` }
  }

  const list = (res.data && res.data.list) || []
  list.forEach((tag) => patchTagIntoTree(tree, tag))
  if (list.length) markTreeDirty(ctx)

  const labels = list.map((t) => t.name).filter(Boolean)
  const preview =
    labels.length <= 8
      ? labels.join('、')
      : `${labels.slice(0, 8).join('、')}等 ${labels.length} 个`
  return {
    ok: true,
    summary: `已新建标签 ${preview}`,
    wrote: true
  }
}

module.exports = { id, run }
