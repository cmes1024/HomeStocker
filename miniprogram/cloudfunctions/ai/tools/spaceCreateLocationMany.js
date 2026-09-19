const { matchSpace } = require('../agent/treeMatch')
const { markTreeDirty, patchLocationIntoTree } = require('../familyTree')

const id = 'space.createLocationMany'
const MAX = 20

async function run(ctx, call, step) {
  const { writers, openid, tree, familyCtx } = ctx
  const raw = Array.isArray(call.locations) ? call.locations : []
  if (!raw.length) {
    return { ok: false, summary: `第 ${step} 步失败：缺少 locations` }
  }
  if (raw.length > MAX) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：一次最多建 ${MAX} 个位置`
    }
  }

  const payloads = []
  const spaceHints = {}
  const labels = []

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] || {}
    const rowStep = i + 1
    const locationName = String(row.locationName || row.name || '').trim()
    if (!locationName) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：第 ${rowStep} 个位置缺少名称`
      }
    }
    const space = matchSpace(tree, row.spaceName)
    if (!space) {
      return {
        ok: false,
        summary: `第 ${step} 步失败：空间「${row.spaceName || ''}」不在家庭结构里`
      }
    }
    spaceHints[space.id] = {
      id: space.id,
      name: space.name,
      isDefault: !!space.isDefault
    }
    payloads.push({ spaceId: space.id, name: locationName })
    labels.push(`${space.name}/${locationName}`)
  }

  const res = await writers.location.createLocationMany(
    openid,
    { locations: payloads },
    { familyCtx, spaces: spaceHints }
  )
  if (!res.ok) {
    return {
      ok: false,
      summary: `第 ${step} 步失败：${res.message || '批量创建位置失败'}`
    }
  }

  const list = (res.data && res.data.list) || []
  list.forEach((loc) => {
    if (!loc) return
    patchLocationIntoTree(tree, loc.spaceId, loc)
  })
  if (list.length) markTreeDirty(ctx)

  const preview =
    labels.length <= 8
      ? labels.join('、')
      : `${labels.slice(0, 8).join('、')}等 ${labels.length} 个`

  return {
    ok: true,
    summary: `已新建位置 ${preview}`,
    wrote: true
  }
}

module.exports = { id, run }
