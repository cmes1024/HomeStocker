const { matchSpace, matchLocation } = require('./treeMatch')
const { compactItem } = require('./refs')

/** 有关键词时多拉候选再过滤，降低「不在最近更新里」漏件 */
const FETCH_NAMED = 100
const FETCH_SCOPED = 80
const FETCH_FAMILY = 80
const CAP_NAMED = 24
const CAP_SCOPED = 12
const CAP_FAMILY = 40

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

function normalizeKeywords(opts = {}) {
  const out = []
  const seen = {}
  const push = (raw) => {
    const k = String(raw || '')
      .trim()
      .toLowerCase()
    if (!k || seen[k]) return
    seen[k] = true
    out.push(k)
  }
  push(opts.name || opts.keyword)
  ;(Array.isArray(opts.names) ? opts.names : []).forEach(push)
  ;(Array.isArray(opts.keywords) ? opts.keywords : []).forEach(push)
  return out
}

function nameMatchesKeywords(itemName, keywords) {
  if (!keywords || !keywords.length) return true
  const n = String(itemName || '').toLowerCase()
  if (!n) return false
  return keywords.some((kw) => n.indexOf(kw) >= 0)
}

/**
 * 共享物资检索（probe / item.search 同源）。
 * 有关键词：提高拉取上限 → 内存子串过滤 → 调用方再 cap。
 */
async function listItemsCompact(db, familyId, opts = {}) {
  const keywords = normalizeKeywords(opts)
  const where = { familyId }
  if (opts.spaceId) where.spaceId = opts.spaceId
  if (opts.locationId) where.locationId = opts.locationId

  let fetchLimit = Number(opts.limit) > 0 ? Number(opts.limit) : FETCH_SCOPED
  if (keywords.length) {
    fetchLimit = Math.max(fetchLimit, FETCH_NAMED)
  } else if (!opts.spaceId && !opts.locationId) {
    fetchLimit = Math.max(fetchLimit, FETCH_FAMILY)
  }
  fetchLimit = Math.min(Math.max(fetchLimit, 1), 100)

  let list = []
  try {
    const res = await db
      .collection('items')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(fetchLimit)
      .get()
    list = res.data || []
  } catch (e) {
    try {
      const res = await db
        .collection('items')
        .where(where)
        .limit(fetchLimit)
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

  if (keywords.length) {
    list = list.filter((item) => nameMatchesKeywords(item.name, keywords))
  }
  return list
}

/** probe / search 共用的结果上限 */
function resultCapFor(opts = {}) {
  const keywords = normalizeKeywords(opts)
  if (keywords.length) return CAP_NAMED
  if (opts.spaceId || opts.locationId) return CAP_SCOPED
  return CAP_FAMILY
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

  const keywords = normalizeKeywords({
    name: probe.name,
    names: probe.names
  })
  const familyWide =
    !!probe.listAll ||
    (!probe.spaceName &&
      !probe.locationName &&
      !space &&
      !loc &&
      !keywords.length)

  // 有关键词时绝不因 listAll 丢掉按名过滤
  const queryOpts = {
    spaceId: space && space.id,
    locationId: loc && loc.id,
    names: keywords,
    limit: keywords.length ? FETCH_NAMED : familyWide ? FETCH_FAMILY : FETCH_SCOPED
  }
  const list = await listItemsCompact(db, familyId, queryOpts)
  const cap = resultCapFor({
    spaceId: queryOpts.spaceId,
    locationId: queryOpts.locationId,
    names: keywords
  })
  const rows = []
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
  resultCapFor,
  normalizeKeywords,
  loadFocus,
  loadItemsByIds,
  runProbe
}
