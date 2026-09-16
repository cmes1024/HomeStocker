const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_SPACE_NAME = '仓库'
const DEFAULT_COVER_KEY = 'default-indoor'

function ok(data) {
  return { ok: true, data }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function shanghaiTodayYmd(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now))
  const y = parts.find((p) => p.type === 'year').value
  const m = parts.find((p) => p.type === 'month').value
  const d = parts.find((p) => p.type === 'day').value
  return `${y}-${m}-${d}`
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d) + days * 86400000
  const dt = new Date(utc)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** @returns {string|null|undefined} null=清空；undefined=格式非法 */
function normalizeDateInput(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const s = String(value).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  return s
}

async function resolveTagIds(familyId, tagIds) {
  if (tagIds === undefined) return { skip: true }
  if (tagIds === null || tagIds === '') return { tagIds: [] }
  if (!Array.isArray(tagIds)) {
    return { error: fail('INVALID_TAGS', '标签格式无效') }
  }
  const unique = []
  const seen = {}
  for (let i = 0; i < tagIds.length; i++) {
    const id = String(tagIds[i] || '').trim()
    if (!id || seen[id]) continue
    seen[id] = true
    unique.push(id)
  }
  if (!unique.length) return { tagIds: [] }
  if (unique.length > 20) {
    return { error: fail('INVALID_TAGS', '标签过多') }
  }
  const snaps = await Promise.all(
    unique.map((id) => db.collection('tags').doc(id).get().catch(() => null))
  )
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i]
    if (!snap || !snap.data || snap.data.familyId !== familyId) {
      return { error: fail('INVALID_TAGS', '标签不属于当前家庭') }
    }
  }
  return { tagIds: unique }
}

function membershipId(openid, familyId) {
  return `${openid}_${familyId}`
}

function expireSubId(itemId, openid) {
  return `${itemId}_${openid}`
}

async function removeInBatches(collection, where, batchSize = 100) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await collection.where(where).limit(batchSize).get()
    const list = res.data || []
    if (!list.length) break
    await Promise.all(list.map((doc) => collection.doc(doc._id).remove()))
    if (list.length < batchSize) break
  }
}

async function upsertExpireSub(familyId, itemId, openid) {
  await db.collection('itemExpireSubs').doc(expireSubId(itemId, openid)).set({
    data: {
      familyId,
      itemId,
      openid,
      createdAt: Date.now()
    }
  })
}

async function removeExpireSub(itemId, openid) {
  await db
    .collection('itemExpireSubs')
    .doc(expireSubId(itemId, openid))
    .remove()
    .catch(() => null)
}

async function removeExpireSubsForItem(itemId) {
  await removeInBatches(db.collection('itemExpireSubs'), { itemId })
}

async function hasExpireSub(itemId, openid) {
  const snap = await db
    .collection('itemExpireSubs')
    .doc(expireSubId(itemId, openid))
    .get()
    .catch(() => null)
  return !!(snap && snap.data)
}

async function subscribedItemSet(familyId, openid) {
  const res = await db
    .collection('itemExpireSubs')
    .where({ familyId, openid })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))
  const set = {}
  ;(res.data || []).forEach((row) => {
    if (row.itemId) set[row.itemId] = true
  })
  return set
}

function overlayExpireReminder(item, subscribed) {
  if (!item || !item._id) return item
  return {
    ...item,
    expireReminderEnabled: !!subscribed[item._id]
  }
}

async function syncExpireSub(familyId, itemId, openid, enabled, expireDate) {
  if (!expireDate || !enabled) {
    await removeExpireSub(itemId, openid)
    return false
  }
  await upsertExpireSub(familyId, itemId, openid)
  return true
}

async function resolveFamilyContext(openid) {
  const userSnap = await db.collection('users').doc(openid).get().catch(() => null)
  if (!userSnap || !userSnap.data) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  const familyId = userSnap.data.currentFamilyId
  if (!familyId) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  const mem = await db
    .collection('memberships')
    .doc(membershipId(openid, familyId))
    .get()
    .catch(() => null)
  if (!mem || !mem.data) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  return { familyId, openid }
}

function normalizeQuantity(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

async function listSpacesForFamily(familyId) {
  const res = await db
    .collection('spaces')
    .where({ familyId })
    .limit(100)
    .get()
  const list = res.data || []
  list.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
  return list
}

async function ensureDefaultSpace(familyId) {
  const existing = await listSpacesForFamily(familyId)
  if (existing.length) {
    return existing.find((s) => s.isDefault) || existing[0]
  }
  const now = Date.now()
  const doc = {
    familyId,
    name: DEFAULT_SPACE_NAME,
    floorId: null,
    isDefault: true,
    coverKey: DEFAULT_COVER_KEY,
    createdAt: now,
    updatedAt: now
  }
  const addRes = await db.collection('spaces').add({ data: doc })
  return { _id: addRes._id, ...doc }
}

async function resolveSpaceId(familyId, spaceId) {
  if (spaceId) {
    const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
    if (!snap || !snap.data) {
      return { error: fail('INVALID_SPACE', '空间不存在') }
    }
    if (snap.data.familyId !== familyId) {
      return { error: fail('INVALID_SPACE', '空间不属于当前家庭') }
    }
    return { spaceId, space: { _id: spaceId, ...snap.data } }
  }
  const space = await ensureDefaultSpace(familyId)
  return { spaceId: space._id, space }
}

async function resolveLocationId(familyId, spaceId, locationId) {
  if (locationId === undefined || locationId === null || locationId === '') {
    return { locationId: null }
  }
  const snap = await db.collection('locations').doc(locationId).get().catch(() => null)
  if (!snap || !snap.data) {
    return { error: fail('INVALID_LOCATION', '位置不存在') }
  }
  if (snap.data.familyId !== familyId || snap.data.spaceId !== spaceId) {
    return { error: fail('INVALID_LOCATION', '位置不属于该空间') }
  }
  return { locationId }
}

const ACTIVITY_FIELD_KEYS = [
  'name',
  'quantity',
  'unit',
  'note',
  'spaceId',
  'locationId',
  'tagIds',
  'productionDate',
  'expireDate'
]

const ACTIVITY_FIELD_LABELS = {
  name: '名称',
  quantity: '数量',
  unit: '单位',
  note: '备注',
  spaceId: '空间',
  locationId: '位置',
  tagIds: '标签',
  productionDate: '生产日',
  expireDate: '过期日'
}

function sameTagIds(a, b) {
  const aa = Array.isArray(a) ? a.map(String).slice().sort() : []
  const bb = Array.isArray(b) ? b.map(String).slice().sort() : []
  if (aa.length !== bb.length) return false
  return aa.every((v, i) => v === bb[i])
}

function normalizeComparable(key, value) {
  if (key === 'tagIds') return null
  if (key === 'quantity') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (value === undefined || value === null || value === '') return null
  return value
}

function computeChangedFields(before, after) {
  const changed = []
  for (let i = 0; i < ACTIVITY_FIELD_KEYS.length; i++) {
    const key = ACTIVITY_FIELD_KEYS[i]
    if (key === 'tagIds') {
      if (!sameTagIds(before.tagIds, after.tagIds)) changed.push(key)
      continue
    }
    const bv = normalizeComparable(key, before[key])
    const av = normalizeComparable(key, after[key])
    if (bv !== av) changed.push(key)
  }
  return changed
}

function summarizeChangedFields(changedFields) {
  return changedFields
    .map((k) => ACTIVITY_FIELD_LABELS[k] || k)
    .filter(Boolean)
    .join('、')
}

async function appendActivity(doc) {
  try {
    await db.collection('activities').add({ data: doc })
  } catch (e) {
    console.error('appendActivity failed', e)
  }
}

async function createItem(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入物资名称')

  const quantity = normalizeQuantity(event.quantity, 1)
  if (quantity === null) return fail('INVALID_QUANTITY', '数量无效')

  const unit = event.unit == null ? '' : String(event.unit).trim().slice(0, 10)
  const note = event.note == null ? '' : String(event.note)
  const source = event.source === 'agent' ? 'agent' : 'ui'
  const now = Date.now()

  const spaceRes = await resolveSpaceId(ctx.familyId, event.spaceId || null)
  if (spaceRes.error) return spaceRes.error

  const locRes = await resolveLocationId(
    ctx.familyId,
    spaceRes.spaceId,
    event.locationId
  )
  if (locRes.error) return locRes.error

  const tagsRes = await resolveTagIds(ctx.familyId, event.tagIds)
  if (tagsRes.error) return tagsRes.error
  const tagIds = tagsRes.skip ? [] : tagsRes.tagIds

  let productionDate = null
  if (event.productionDate !== undefined) {
    const d = normalizeDateInput(event.productionDate)
    if (d === undefined) return fail('INVALID_DATE', '生产日期无效')
    productionDate = d
  }

  let expireDate = null
  if (event.expireDate !== undefined) {
    const d = normalizeDateInput(event.expireDate)
    if (d === undefined) return fail('INVALID_DATE', '过期日期无效')
    expireDate = d
  }

  const doc = {
    familyId: ctx.familyId,
    name,
    quantity,
    unit,
    note,
    spaceId: spaceRes.spaceId,
    locationId: locRes.locationId,
    tagIds,
    productionDate,
    expireDate,
    expireReminderEnabled: false,
    createdBy: openid,
    source,
    createdAt: now,
    updatedAt: now
  }

  const addRes = await db.collection('items').add({ data: doc })
  let mine = false
  try {
    mine = await syncExpireSub(
      ctx.familyId,
      addRes._id,
      openid,
      event.expireReminderEnabled === true,
      expireDate
    )
  } catch (e) {
    console.warn('syncExpireSub create failed', addRes._id, e)
  }
  await appendActivity({
    familyId: ctx.familyId,
    itemId: addRes._id,
    action: 'create',
    actorOpenid: openid,
    itemName: name,
    source,
    createdAt: now
  })
  return ok({ _id: addRes._id, ...doc, expireReminderEnabled: mine })
}

async function updateItem(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const itemId = event.itemId
  if (!itemId) return fail('INVALID_ID', '缺少 itemId')

  const snap = await db.collection('items').doc(itemId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '物资不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该物资')
  }

  const patch = { updatedAt: Date.now() }
  if (event.name !== undefined) {
    const name = String(event.name || '').trim()
    if (!name) return fail('INVALID_NAME', '请输入物资名称')
    patch.name = name
  }
  if (event.quantity !== undefined) {
    const quantity = normalizeQuantity(event.quantity, snap.data.quantity)
    if (quantity === null) return fail('INVALID_QUANTITY', '数量无效')
    patch.quantity = quantity
  }
  if (event.unit !== undefined) {
    patch.unit = String(event.unit || '').trim().slice(0, 10)
  }
  if (event.note !== undefined) {
    patch.note = String(event.note)
  }

  if (event.tagIds !== undefined) {
    const tagsRes = await resolveTagIds(ctx.familyId, event.tagIds)
    if (tagsRes.error) return tagsRes.error
    if (!tagsRes.skip) patch.tagIds = tagsRes.tagIds
  }

  if (event.productionDate !== undefined) {
    const d = normalizeDateInput(event.productionDate)
    if (d === undefined) return fail('INVALID_DATE', '生产日期无效')
    patch.productionDate = d
  }

  if (event.expireDate !== undefined) {
    const d = normalizeDateInput(event.expireDate)
    if (d === undefined) return fail('INVALID_DATE', '过期日期无效')
    patch.expireDate = d
  }

  const spaceChanging = event.spaceId !== undefined
  const locationProvided = event.locationId !== undefined

  let nextSpaceId = snap.data.spaceId
  if (spaceChanging) {
    const spaceRes = await resolveSpaceId(ctx.familyId, event.spaceId || null)
    if (spaceRes.error) return spaceRes.error
    nextSpaceId = spaceRes.spaceId
    patch.spaceId = nextSpaceId
  } else if (!nextSpaceId) {
    const spaceRes = await resolveSpaceId(ctx.familyId, null)
    if (spaceRes.error) return spaceRes.error
    nextSpaceId = spaceRes.spaceId
    patch.spaceId = nextSpaceId
  }

  if (locationProvided) {
    const locRes = await resolveLocationId(
      ctx.familyId,
      nextSpaceId,
      event.locationId
    )
    if (locRes.error) return locRes.error
    patch.locationId = locRes.locationId
  } else if (spaceChanging) {
    // Space changed without new location → clear stale pointer
    patch.locationId = null
  } else if (snap.data.locationId) {
    // Validate existing location still matches space after backfill
    const locRes = await resolveLocationId(
      ctx.familyId,
      nextSpaceId,
      snap.data.locationId
    )
    if (locRes.error) {
      patch.locationId = null
    }
  }

  await db.collection('items').doc(itemId).update({ data: patch })
  const merged = { ...snap.data, ...patch }
  const changedFields = computeChangedFields(snap.data, merged)
  if (changedFields.length) {
    const source = event.source === 'agent' ? 'agent' : 'ui'
    await appendActivity({
      familyId: ctx.familyId,
      itemId,
      action: 'update',
      actorOpenid: openid,
      itemName: merged.name || snap.data.name || '',
      changedFields,
      summary: summarizeChangedFields(changedFields),
      source,
      createdAt: patch.updatedAt || Date.now()
    })
  }
  const nextExpire = merged.expireDate
  try {
    if (!nextExpire) {
      await removeExpireSubsForItem(itemId)
    } else if (event.expireReminderEnabled !== undefined) {
      await syncExpireSub(
        ctx.familyId,
        itemId,
        openid,
        event.expireReminderEnabled === true,
        nextExpire
      )
    }
  } catch (e) {
    console.warn('syncExpireSub update failed', itemId, e)
  }
  const mine = await hasExpireSub(itemId, openid)
  return ok({ _id: itemId, ...merged, expireReminderEnabled: mine })
}

async function removeItem(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const itemId = event.itemId
  if (!itemId) return fail('INVALID_ID', '缺少 itemId')

  const snap = await db.collection('items').doc(itemId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '物资不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该物资')
  }

  const itemName = snap.data.name || ''
  const source = event.source === 'agent' ? 'agent' : snap.data.source === 'agent' ? 'agent' : 'ui'
  await db.collection('items').doc(itemId).remove()
  await removeExpireSubsForItem(itemId).catch((e) => {
    console.warn('removeExpireSubsForItem failed', itemId, e)
  })
  await appendActivity({
    familyId: ctx.familyId,
    itemId,
    action: 'remove',
    actorOpenid: openid,
    itemName,
    source,
    createdAt: Date.now()
  })
  return ok({ removed: true, itemId })
}

async function getItem(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const itemId = event.itemId
  if (!itemId) return fail('INVALID_ID', '缺少 itemId')

  const snap = await db.collection('items').doc(itemId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '物资不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权查看该物资')
  }

  const mine = await hasExpireSub(itemId, openid)
  return ok({ _id: itemId, ...snap.data, expireReminderEnabled: mine })
}

async function countItems(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  // where().count() 在部分环境下会偏小，按页累加才是全家真实件数。
  const pageSize = 100
  let total = 0
  let skip = 0
  while (skip <= 1000) {
    const res = await db
      .collection('items')
      .where({ familyId: ctx.familyId })
      .field({ _id: true })
      .skip(skip)
      .limit(pageSize)
      .get()
    const n = (res.data && res.data.length) || 0
    total += n
    if (n < pageSize) break
    skip += n
  }
  return ok({ total })
}

async function listItems(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  const where = { familyId: ctx.familyId }
  if (event.spaceId) {
    where.spaceId = String(event.spaceId)
  }
  if (event.tagId) {
    where.tagIds = String(event.tagId)
  }
  const res = await db
    .collection('items')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()
  const subscribed = await subscribedItemSet(ctx.familyId, openid)
  return ok({
    list: (res.data || []).map((item) => overlayExpireReminder(item, subscribed))
  })
}

async function searchItems(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const keyword = String(event.keyword || '').trim()
  const limit = Math.min(Math.max(Number(event.limit) || 20, 1), 50)

  if (!keyword) {
    return listItems(openid, {
      limit,
      spaceId: event.spaceId,
      tagId: event.tagId
    })
  }

  const where = { familyId: ctx.familyId }
  if (event.spaceId) {
    where.spaceId = String(event.spaceId)
  }
  if (event.tagId) {
    where.tagIds = String(event.tagId)
  }

  const res = await db
    .collection('items')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  const lower = keyword.toLowerCase()
  const subscribed = await subscribedItemSet(ctx.familyId, openid)
  const list = (res.data || [])
    .filter((item) => String(item.name || '').toLowerCase().includes(lower))
    .slice(0, limit)
    .map((item) => overlayExpireReminder(item, subscribed))

  return ok({ list })
}

/**
 * 临期 + 已过期（today … today+3 与更早），忽略提醒开关。
 */
async function listExpiring(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 50, 1), 100)
  const today = shanghaiTodayYmd()
  const end = addDaysYmd(today, 3)

  const res = await db
    .collection('items')
    .where({
      familyId: ctx.familyId,
      expireDate: _.lte(end)
    })
    .orderBy('expireDate', 'asc')
    .limit(limit)
    .get()
    .catch(async (err) => {
      // 索引未建或旧数据无 expireDate 时降级：拉列表再过滤
      console.warn('listExpiring query fallback', err && err.message)
      const all = await db
        .collection('items')
        .where({ familyId: ctx.familyId })
        .limit(100)
        .get()
      const filtered = (all.data || [])
        .filter((item) => {
          const d = item.expireDate
          return d && typeof d === 'string' && d <= end
        })
        .sort((a, b) => String(a.expireDate).localeCompare(String(b.expireDate)))
        .slice(0, limit)
      return { data: filtered }
    })

  const subscribed = await subscribedItemSet(ctx.familyId, openid)
  const list = await attachPlaceNames(
    ctx.familyId,
    (res.data || [])
      .filter((item) => item.expireDate)
      .map((item) => overlayExpireReminder(item, subscribed))
  )
  return ok({ list, today, windowEnd: end })
}

async function attachPlaceNames(familyId, list) {
  if (!list.length) return list
  const spaceIds = [...new Set(list.map((i) => i.spaceId).filter(Boolean))]
  const locationIds = [...new Set(list.map((i) => i.locationId).filter(Boolean))]
  const [spaceRes, locRes] = await Promise.all([
    spaceIds.length
      ? db.collection('spaces').where({ _id: _.in(spaceIds) }).limit(100).get()
      : Promise.resolve({ data: [] }),
    locationIds.length
      ? db.collection('locations').where({ _id: _.in(locationIds) }).limit(100).get()
      : Promise.resolve({ data: [] })
  ])
  const spaceMap = {}
  const locMap = {}
  ;(spaceRes.data || []).forEach((s) => {
    if (s.familyId === familyId) spaceMap[s._id] = s.name || ''
  })
  ;(locRes.data || []).forEach((l) => {
    if (l.familyId === familyId) locMap[l._id] = l.name || ''
  })
  return list.map((item) => ({
    ...item,
    spaceName: (item.spaceId && spaceMap[item.spaceId]) || '',
    locationName: (item.locationId && locMap[item.locationId]) || ''
  }))
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  const action = event && event.action
  try {
    switch (action) {
      case 'create':
        return await createItem(OPENID, event)
      case 'update':
        return await updateItem(OPENID, event)
      case 'remove':
        return await removeItem(OPENID, event)
      case 'get':
        return await getItem(OPENID, event)
      case 'list':
        return await listItems(OPENID, event)
      case 'count':
        return await countItems(OPENID)
      case 'search':
        return await searchItems(OPENID, event)
      case 'listExpiring':
        return await listExpiring(OPENID, event)
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('item error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}
