const { matchSpace, matchLocation } = require('./treeMatch')
const { compactItem } = require('./refs')

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd || '').split('-').map(Number)
  if (!y || !m || !d) return ymd
  const utc = Date.UTC(y, m - 1, d) + days * 86400000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

async function listItemsCompact(db, familyId, opts = {}) {
  const where = { familyId }
  if (opts.spaceId) where.spaceId = opts.spaceId
  if (opts.locationId) where.locationId = opts.locationId
  let list = []
  try {
    const res = await db
      .collection('items')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(opts.limit || 40)
      .get()
    list = res.data || []
  } catch (e) {
    // 缺复合索引时 orderBy 会失败；降级为不过排序 / 内存过滤
    try {
      const res = await db
        .collection('items')
        .where(where)
        .limit(opts.limit || 40)
        .get()
      list = res.data || []
    } catch (e2) {
      const res = await db.collection('items').where({ familyId }).limit(100).get()
      list = (res.data || []).filter((item) => {
        if (opts.spaceId && item.spaceId !== opts.spaceId) return false
        if (opts.locationId && item.locationId !== opts.locationId) return false
        return true
      })
    }
  }
  const kw = String(opts.name || '').trim().toLowerCase()
  if (kw) {
    list = list.filter((item) => String(item.name || '').toLowerCase().includes(kw))
  }
  return list
}

async function loadFocus(db, familyId, tree, itemId) {
  const id = String(itemId || '').trim()
  if (!id) return null
  const snap = await db.collection('items').doc(id).get().catch(() => null)
  if (!snap || !snap.data || snap.data.familyId !== familyId) return null
  return compactItem({ _id: id, ...snap.data }, 'F1', tree)
}

/** 确认重放：按 itemId 灌 refs（不发短号；lookup 走 itemId） */
async function loadItemsByIds(db, familyId, tree, ids, refs, skipItemId) {
  const unique = (ids || []).filter((id) => id && id !== skipItemId)
  if (!unique.length) return []
  const _ = db.command
  let list = []
  try {
    const res = await db
      .collection('items')
      .where({ _id: _.in(unique) })
      .limit(unique.length)
      .get()
    list = res.data || []
  } catch (e) {
    const snaps = await Promise.all(
      unique.map((id) => db.collection('items').doc(id).get().catch(() => null))
    )
    list = snaps
      .map((snap, i) => (snap && snap.data ? { _id: unique[i], ...snap.data } : null))
      .filter(Boolean)
  }
  const byId = {}
  list.forEach((doc) => {
    if (!doc || !doc._id) return
    byId[doc._id] = doc
  })
  const rows = []
  unique.forEach((id) => {
    const doc = byId[id]
    if (!doc || doc.familyId !== familyId) return
    const row = compactItem(doc, '', tree)
    refs[`ID:${id}`] = row
    rows.push(row)
  })
  return rows
}

async function runProbe(db, familyId, tree, probe, refs) {
  if (!probe) return []
  let space = matchSpace(tree, probe.spaceName)
  let loc = matchLocation(space, probe.locationName)
  // 只有位置名、或空间没配上时：在树里解析唯一位置
  if (probe.locationName && !loc) {
    const hits = []
    ;((tree && tree.spaces) || []).forEach((s) => {
      const hit = matchLocation(s, probe.locationName)
      if (hit) hits.push({ space: s, loc: hit })
    })
    if (hits.length === 1) {
      space = hits[0].space
      loc = hits[0].loc
    } else if (space) {
      loc = matchLocation(space, probe.locationName)
    }
  }
  if (probe.locationName && !loc) return []
  const familyWide =
    !!probe.listAll || (!probe.spaceName && !probe.locationName && !space && !loc)
  const list = await listItemsCompact(db, familyId, {
    spaceId: space && space.id,
    locationId: loc && loc.id,
    name: probe.name,
    limit: familyWide ? 80 : 40
  })
  const rows = []
  const cap = familyWide ? 40 : 12
  list.slice(0, cap).forEach((item, i) => {
    const row = compactItem(item, `P${i + 1}`, tree)
    refs[row.ref] = row
    rows.push(row)
  })
  return rows
}

module.exports = {
  addDaysYmd,
  listItemsCompact,
  loadFocus,
  loadItemsByIds,
  runProbe
}
