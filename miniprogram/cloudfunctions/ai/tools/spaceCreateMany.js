const { markTreeDirty, patchSpaceIntoTree } = require('../familyTree')

const id = 'space.createMany'
const MAX = 20

async function run(ctx, call, step) {
  const { writers, openid, familyCtx } = ctx
  const raw = Array.isArray(call.spaces)
    ? call.spaces
    : Array.isArray(call.names)
      ? call.names.map((n) => ({ name: n }))
      : []
  if (!raw.length) {
    return { ok: false, summary: `第 ${step} 步失败：缺少 spaces` }
  }
  if (raw.length > MAX) {
    return { ok: false, summary: `第 ${step} 步失败：一次最多建 ${MAX} 个空间` }
  }

  const spaces = raw.map((row) => ({
    name: String((row && (row.name || row.spaceName)) || '').trim()
  }))
  for (let i = 0; i < spaces.length; i++) {
    if (!spaces[i].name) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：第 ${i + 1} 个空间缺少名称`
      }
    }
  }

  const res = await writers.space.createMany(
    openid,
    { spaces },
    { familyCtx }
  )
  if (!res.ok) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：${res.message || '批量创建空间失败'}`
    }
  }

  const list = (res.data && res.data.list) || []
  list.forEach((space) => patchSpaceIntoTree(ctx.tree, space))
  if (list.length) markTreeDirty(ctx)

  const labels = list.map((s) => s.name).filter(Boolean)
  const preview =
    labels.length <= 8
      ? labels.join('、')
      : `${labels.slice(0, 8).join('、')}等 ${labels.length} 个`

  return {
    ok: true,
    summary: `已新建空间 ${preview}`,
    wrote: true
  }
}

module.exports = { id, run }
