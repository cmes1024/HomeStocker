/**
 * 物资领域写/读。item 云函数与 ai.act 共用，避免嵌套 callFunction 丢失 OPENID。
 * 由 item/index.js 与 ai/itemService.js 同时持有一份。
 */
module.exports = function createItemService(db) {
  const _ = db.command
  const entitlements = require('./entitlements')

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

async function resolveTagIds(familyId, tagIds, options) {
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
  // ai.act 已从家庭树解析过 id，跳过逐条 doc.get
  if (options && options.trusted) return { tagIds: unique }
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

async function syncExpireSub(familyId, itemId, openid, enabled, expireDate, opts) {
  if (!expireDate || !enabled) {
    if (!(opts && opts.skipRemoveIfDisabled)) {
      await removeExpireSub(itemId, openid)
    }
    return false
  }
  await upsertExpireSub(familyId, itemId, openid)
  return true
}

function extractBatchAddIds(addRes) {
  if (!addRes) return []
  if (Array.isArray(addRes._ids)) return addRes._ids
  if (Array.isArray(addRes.ids)) return addRes.ids
  if (Array.isArray(addRes.id_list)) return addRes.id_list
  if (addRes._id) return [addRes._id]
  return []
}

async function resolveFamilyContext(openid, reuse) {
  if (reuse && reuse.familyId && (!reuse.openid || reuse.openid === openid)) {
    return { familyId: reuse.familyId, openid }
  }
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

async function readFamilyItemCount(familyId) {
  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) {
    return { error: fail('NO_FAMILY', '家庭不存在') }
  }
  let itemCount = fam.data.itemCount
  if (itemCount == null || !Number.isFinite(Number(itemCount)) || Number(itemCount) < 0) {
    let total = 0
    try {
      const counted = await db.collection('items').where({ familyId }).count()
      total = Number(counted && counted.total) || 0
    } catch (e) {
      console.warn('readFamilyItemCount count() failed', familyId, e && e.message)
      total = 0
    }
    try {
      await db.collection('families').doc(familyId).update({
        data: { itemCount: total }
      })
    } catch (e) {
      console.warn('readFamilyItemCount writeback failed', familyId, e && e.message)
    }
    itemCount = total
  } else {
    itemCount = Number(itemCount)
  }
  return { itemCount, family: fam.data }
}

async function assertItemCapacity(familyId, addN) {
  const n = Math.max(0, Number(addN) || 0)
  const counted = await readFamilyItemCount(familyId)
  if (counted.error) return counted.error

  let sub = null
  try {
    const snap = await db.collection('familySubscriptions').doc(familyId).get()
    if (snap && snap.data) sub = snap.data
  } catch (e) {
    sub = null
  }
  const ent = entitlements.resolveEffectiveFromSub(sub)
  if (ent.itemLimit != null && counted.itemCount + n > ent.itemLimit) {
    return fail(
      'ITEM_LIMIT_REACHED',
      `已达免费物资上限（${ent.itemLimit} 件），可到家庭页兑换内测加强版`
    )
  }
  return { itemCount: counted.itemCount, entitlement: ent }
}

async function bumpItemCount(familyId, delta) {
  const d = Number(delta) || 0
  if (!d) return
  try {
    if (d < 0) {
      const counted = await readFamilyItemCount(familyId)
      if (counted.error) return
      const next = Math.max(0, counted.itemCount + d)
      await db.collection('families').doc(familyId).update({
        data: { itemCount: next }
      })
      return
    }
    await db.collection('families').doc(familyId).update({
      data: { itemCount: _.inc(d) }
    })
  } catch (e) {
    console.warn('bumpItemCount failed', familyId, d, e && e.message)
  }
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

async function resolveSpaceId(familyId, spaceId, hint) {
  if (spaceId) {
    const hintId = hint && (hint._id || hint.id)
    if (hintId && String(hintId) === String(spaceId) && hint.name != null) {
      return {
        spaceId,
        space: {
          _id: spaceId,
          name: String(hint.name || ''),
          familyId,
          isDefault: !!hint.isDefault
        }
      }
    }
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

async function resolveLocationId(familyId, spaceId, locationId, hint) {
  if (locationId === undefined || locationId === null || locationId === '') {
    return { locationId: null, location: null }
  }
  const hintId = hint && (hint._id || hint.id)
  if (hintId && String(hintId) === String(locationId) && hint.name != null) {
    return {
      locationId,
      location: {
        _id: locationId,
        name: String(hint.name || ''),
        familyId,
        spaceId
      }
    }
  }
  const snap = await db.collection('locations').doc(locationId).get().catch(() => null)
  if (!snap || !snap.data) {
    return { error: fail('INVALID_LOCATION', '位置不存在') }
  }
  if (snap.data.familyId !== familyId || snap.data.spaceId !== spaceId) {
    return { error: fail('INVALID_LOCATION', '位置不属于该空间') }
  }
  return { locationId, location: { _id: locationId, ...snap.data } }
}

async function snapshotPlace(familyId, spaceId, locationId, hints) {
  const out = {
    spaceId: spaceId || '',
    spaceName: '',
    locationId: locationId || '',
    locationName: ''
  }
  try {
    const spaceHint = hints && hints.space
    if (spaceHint && spaceHint.name) {
      out.spaceName = String(spaceHint.name)
    } else if (spaceId) {
      const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
      if (snap && snap.data && snap.data.familyId === familyId) {
        out.spaceName = String(snap.data.name || '')
      }
    }
    const locHint = hints && hints.location
    if (locHint && locHint.name) {
      out.locationName = String(locHint.name)
    } else if (locationId) {
      const snap = await db.collection('locations').doc(locationId).get().catch(() => null)
      if (snap && snap.data && snap.data.familyId === familyId) {
        out.locationName = String(snap.data.name || '')
      }
    }
  } catch (e) {
    console.warn('snapshotPlace failed', e)
  }
  return out
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

function batchItemNameSnapshot(names) {
  const list = (names || [])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
  if (!list.length) return '多件物品'
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]}、${list[1]}`
  return `${list[0]}、${list[1]}等`
}

async function resolveActivityLimit(familyId) {
  let sub = null
  try {
    const snap = await db.collection('familySubscriptions').doc(familyId).get()
    if (snap && snap.data) sub = snap.data
  } catch (e) {
    sub = null
  }
  const ent = entitlements.resolveEffectiveFromSub(sub)
  const n = Number(ent.activityLimit)
  if (!Number.isFinite(n) || n <= 0) {
    return Number(entitlements.PLANS.free.activityLimit) || 30
  }
  return n
}

/** 超出档位保留上限时删最旧；失败不回滚物资写。 */
async function trimActivities(familyId) {
  if (!familyId) return
  try {
    const keepN = await resolveActivityLimit(familyId)
    const col = db.collection('activities').where({ familyId })
    const countRes = await col.count()
    const total = Number(countRes && countRes.total) || 0
    if (total <= keepN) return
    let remaining = total - keepN
    while (remaining > 0) {
      const batch = Math.min(remaining, 100)
      const old = await col.orderBy('createdAt', 'asc').limit(batch).get()
      const rows = (old && old.data) || []
      if (!rows.length) break
      await Promise.all(
        rows.map((row) =>
          db
            .collection('activities')
            .doc(row._id)
            .remove()
            .catch((e) => {
              console.warn('trimActivities remove failed', row._id, e && e.message)
            })
        )
      )
      remaining -= rows.length
      if (rows.length < batch) break
    }
  } catch (e) {
    console.error('trimActivities failed', familyId, e)
  }
}

async function appendActivity(doc) {
  try {
    await db.collection('activities').add({ data: doc })
    if (doc && doc.familyId) {
      await trimActivities(doc.familyId)
    }
  } catch (e) {
    console.error('appendActivity failed', e)
  }
}

async function createItem(openid, event, options = {}) {
  const ctx = await resolveFamilyContext(openid, options.familyCtx)
  if (ctx.error) return ctx.error

  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入物资名称')

  const quantity = normalizeQuantity(event.quantity, 1)
  if (quantity === null) return fail('INVALID_QUANTITY', '数量无效')

  const unit = event.unit == null ? '' : String(event.unit).trim().slice(0, 10)
  const note = event.note == null ? '' : String(event.note)
  const source = event.source === 'agent' ? 'agent' : 'ui'
  const now = Date.now()

  const spaceRes = await resolveSpaceId(ctx.familyId, event.spaceId || null, options.space)
  if (spaceRes.error) return spaceRes.error

  const locRes = await resolveLocationId(
    ctx.familyId,
    spaceRes.spaceId,
    event.locationId,
    options.location
  )
  if (locRes.error) return locRes.error

  const tagsRes = await resolveTagIds(ctx.familyId, event.tagIds, {
    trusted: !!options.trustTagIds
  })
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

  const cap = await assertItemCapacity(ctx.familyId, 1)
  if (cap.code) return cap

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
  await bumpItemCount(ctx.familyId, 1)
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
  const place = await snapshotPlace(
    ctx.familyId,
    spaceRes.spaceId,
    locRes.locationId,
    { space: spaceRes.space, location: locRes.location }
  )
  await appendActivity({
    familyId: ctx.familyId,
    itemId: addRes._id,
    action: 'create',
    actorOpenid: openid,
    itemName: name,
    quantity,
    unit,
    source,
    createdAt: now,
    ...place
  })
  return ok({ _id: addRes._id, ...doc, expireReminderEnabled: mine })
}

const CREATE_MANY_LIMIT = 20

/**
 * 批量新建：先全部校验，任一非法则零写入；通过后一次 items.add 数组。
 * activities：n≥2 合成一条 create_batch；n=1 仍写单条 create。
 * options.spaces / options.locations 为 id→hint 映射，供跳过重复 doc.get。
 */
async function createMany(openid, event, options = {}) {
  const ctx = await resolveFamilyContext(openid, options.familyCtx)
  if (ctx.error) return ctx.error

  const rawItems = Array.isArray(event && event.items) ? event.items : []
  if (!rawItems.length) return fail('INVALID_ITEMS', '没有要写入的物资')
  if (rawItems.length > CREATE_MANY_LIMIT) {
    return fail('INVALID_ITEMS', `一次最多记 ${CREATE_MANY_LIMIT} 件`)
  }

  const cap = await assertItemCapacity(ctx.familyId, rawItems.length)
  if (cap.code) return cap

  const defaultSource = event && event.source === 'agent' ? 'agent' : 'ui'
  const now = Date.now()
  const prepared = []

  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i] || {}
    const step = i + 1
    const name = String(row.name || '').trim()
    if (!name) {
      return fail('INVALID_NAME', `第 ${step} 件缺少名称`)
    }

    const quantity = normalizeQuantity(row.quantity, 1)
    if (quantity === null) {
      return fail('INVALID_QUANTITY', `第 ${step} 件数量无效`)
    }

    const unit = row.unit == null ? '' : String(row.unit).trim().slice(0, 10)
    const note = row.note == null ? '' : String(row.note)
    const source = row.source === 'agent' || defaultSource === 'agent' ? 'agent' : 'ui'

    const spaceId = row.spaceId || null
    const spaceHint =
      (options.spaces && spaceId && options.spaces[spaceId]) ||
      options.space ||
      null
    const spaceRes = await resolveSpaceId(ctx.familyId, spaceId, spaceHint)
    if (spaceRes.error) {
      return fail(
        spaceRes.error.code || 'INVALID_SPACE',
        `第 ${step} 件：${spaceRes.error.message || '空间无效'}`
      )
    }

    const locationId =
      row.locationId === undefined || row.locationId === null || row.locationId === ''
        ? null
        : row.locationId
    const locHint =
      (options.locations && locationId && options.locations[locationId]) ||
      options.location ||
      null
    const locRes = await resolveLocationId(
      ctx.familyId,
      spaceRes.spaceId,
      locationId,
      locHint
    )
    if (locRes.error) {
      return fail(
        locRes.error.code || 'INVALID_LOCATION',
        `第 ${step} 件：${locRes.error.message || '位置无效'}`
      )
    }

    const tagsRes = await resolveTagIds(ctx.familyId, row.tagIds, {
      trusted: !!options.trustTagIds
    })
    if (tagsRes.error) {
      return fail(
        tagsRes.error.code || 'INVALID_TAGS',
        `第 ${step} 件：${tagsRes.error.message || '标签无效'}`
      )
    }
    const tagIds = tagsRes.skip ? [] : tagsRes.tagIds

    let productionDate = null
    if (row.productionDate !== undefined) {
      const d = normalizeDateInput(row.productionDate)
      if (d === undefined) {
        return fail('INVALID_DATE', `第 ${step} 件生产日期无效`)
      }
      productionDate = d
    }

    let expireDate = null
    if (row.expireDate !== undefined) {
      const d = normalizeDateInput(row.expireDate)
      if (d === undefined) {
        return fail('INVALID_DATE', `第 ${step} 件过期日期无效`)
      }
      expireDate = d
    }

    const wantSub = row.expireReminderEnabled === true
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

    const place = await snapshotPlace(
      ctx.familyId,
      spaceRes.spaceId,
      locRes.locationId,
      { space: spaceRes.space, location: locRes.location }
    )

    prepared.push({
      doc,
      place,
      wantSub,
      expireDate,
      name,
      quantity,
      unit,
      source
    })
  }

  const docs = prepared.map((p) => p.doc)
  let addRes
  try {
    addRes = await db.collection('items').add({ data: docs })
  } catch (e) {
    console.error('createMany items.add failed', e)
    return fail('INTERNAL', e.message || '批量写入失败')
  }

  const ids = extractBatchAddIds(addRes)
  if (ids.length !== docs.length) {
    console.error('createMany id count mismatch', ids.length, docs.length, addRes)
    return fail('INTERNAL', '批量写入结果异常，请核对物资列表')
  }

  await bumpItemCount(ctx.familyId, ids.length)

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i]
    if (!p.wantSub || !p.expireDate) continue
    try {
      await syncExpireSub(ctx.familyId, ids[i], openid, true, p.expireDate, {
        skipRemoveIfDisabled: true
      })
    } catch (e) {
      console.warn('syncExpireSub createMany failed', ids[i], e)
    }
  }

  try {
    if (prepared.length >= 2) {
      const batchSource = prepared.some((p) => p.source === 'agent')
        ? 'agent'
        : defaultSource
      await db.collection('activities').add({
        data: {
          familyId: ctx.familyId,
          itemId: '',
          action: 'create_batch',
          actorOpenid: openid,
          itemName: batchItemNameSnapshot(prepared.map((p) => p.name)),
          batchCount: prepared.length,
          source: batchSource,
          createdAt: now
        }
      })
    } else {
      const p = prepared[0]
      await db.collection('activities').add({
        data: {
          familyId: ctx.familyId,
          itemId: ids[0],
          action: 'create',
          actorOpenid: openid,
          itemName: p.name,
          quantity: p.quantity,
          unit: p.unit,
          source: p.source,
          createdAt: now,
          ...p.place
        }
      })
    }
    await trimActivities(ctx.familyId)
  } catch (e) {
    console.error('createMany activities.add failed', e)
  }

  const list = prepared.map((p, i) => ({
    _id: ids[i],
    ...p.doc,
    expireReminderEnabled: !!(p.wantSub && p.expireDate)
  }))
  return ok({ list, count: list.length })
}

async function updateItem(openid, event, options = {}) {
  const ctx = await resolveFamilyContext(openid, options.familyCtx)
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
    const tagsRes = await resolveTagIds(ctx.familyId, event.tagIds, {
      trusted: !!options.trustTagIds
    })
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
  let spaceHint = options.space || null
  if (spaceChanging) {
    const spaceRes = await resolveSpaceId(
      ctx.familyId,
      event.spaceId || null,
      options.space
    )
    if (spaceRes.error) return spaceRes.error
    nextSpaceId = spaceRes.spaceId
    patch.spaceId = nextSpaceId
    spaceHint = spaceRes.space
  } else if (!nextSpaceId) {
    const spaceRes = await resolveSpaceId(ctx.familyId, null)
    if (spaceRes.error) return spaceRes.error
    nextSpaceId = spaceRes.spaceId
    patch.spaceId = nextSpaceId
    spaceHint = spaceRes.space
  }

  let nextLocationId = snap.data.locationId || null
  let locHint = options.location || null
  if (locationProvided) {
    const locRes = await resolveLocationId(
      ctx.familyId,
      nextSpaceId,
      event.locationId,
      options.location
    )
    if (locRes.error) return locRes.error
    patch.locationId = locRes.locationId
    nextLocationId = locRes.locationId
    locHint = locRes.location
  } else if (spaceChanging) {
    // Space changed without new location → clear stale pointer
    patch.locationId = null
    nextLocationId = null
  } else if (snap.data.locationId) {
    // Validate existing location still matches space after backfill
    const locRes = await resolveLocationId(
      ctx.familyId,
      nextSpaceId,
      snap.data.locationId
    )
    if (locRes.error) {
      patch.locationId = null
      nextLocationId = null
    } else {
      locHint = locRes.location
    }
  }

  await db.collection('items').doc(itemId).update({ data: patch })
  const merged = { ...snap.data, ...patch }
  const changedFields = computeChangedFields(snap.data, merged)
  if (changedFields.length) {
    const source = event.source === 'agent' ? 'agent' : 'ui'
    const place = await snapshotPlace(ctx.familyId, nextSpaceId, nextLocationId, {
      space: spaceHint,
      location: locHint
    })
    await appendActivity({
      familyId: ctx.familyId,
      itemId,
      action: 'update',
      actorOpenid: openid,
      itemName: merged.name || snap.data.name || '',
      quantity: merged.quantity,
      unit: merged.unit || '',
      changedFields,
      summary: summarizeChangedFields(changedFields),
      source,
      createdAt: patch.updatedAt || Date.now(),
      ...place
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

async function removeItem(openid, event, options = {}) {
  const ctx = await resolveFamilyContext(openid, options.familyCtx)
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
  const place = await snapshotPlace(
    ctx.familyId,
    snap.data.spaceId,
    snap.data.locationId,
    null
  )
  await db.collection('items').doc(itemId).remove()
  await bumpItemCount(ctx.familyId, -1)
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
    createdAt: Date.now(),
    ...place
  })
  return ok({ removed: true, itemId })
}

const REMOVE_MANY_LIMIT = 20

/**
 * 批量删除：先全部校验归属，任一非法则零删除；通过后并行 remove。
 * activities：n≥2 合成一条 remove_batch；n=1 仍写单条 remove。
 */
async function removeMany(openid, event, options = {}) {
  const ctx = await resolveFamilyContext(openid, options.familyCtx)
  if (ctx.error) return ctx.error

  const rawIds = Array.isArray(event.itemIds) ? event.itemIds : []
  const ids = []
  const seen = {}
  rawIds.forEach((id) => {
    const s = String(id || '').trim()
    if (!s || seen[s]) return
    seen[s] = true
    ids.push(s)
  })
  if (!ids.length) return fail('INVALID_IDS', '没有要删除的物资')
  if (ids.length > REMOVE_MANY_LIMIT) {
    return fail('INVALID_IDS', `一次最多删 ${REMOVE_MANY_LIMIT} 件`)
  }

  const snaps = await Promise.all(
    ids.map((id) => db.collection('items').doc(id).get().catch(() => null))
  )
  const items = []
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i]
    if (!snap || !snap.data) return fail('NOT_FOUND', '物资不存在')
    if (snap.data.familyId !== ctx.familyId) {
      return fail('FORBIDDEN', '无权操作该物资')
    }
    items.push({ _id: ids[i], ...snap.data })
  }

  const defaultSource = event.source === 'agent' ? 'agent' : 'ui'
  const now = Date.now()
  const names = items.map((it) => it.name || '')

  let placeForSingle = null
  if (items.length === 1) {
    const it = items[0]
    placeForSingle = await snapshotPlace(
      ctx.familyId,
      it.spaceId,
      it.locationId,
      null
    )
  }

  try {
    await Promise.all(items.map((it) => db.collection('items').doc(it._id).remove()))
  } catch (e) {
    console.error('removeMany items.remove failed', e)
    return fail('INTERNAL', e.message || '批量删除失败')
  }

  await bumpItemCount(ctx.familyId, -items.length)

  await Promise.all(
    items.map((it) =>
      removeExpireSubsForItem(it._id).catch((err) => {
        console.warn('removeExpireSubsForItem failed', it._id, err)
      })
    )
  )

  try {
    if (items.length >= 2) {
      await db.collection('activities').add({
        data: {
          familyId: ctx.familyId,
          itemId: '',
          action: 'remove_batch',
          actorOpenid: openid,
          itemName: batchItemNameSnapshot(names),
          batchCount: items.length,
          source: defaultSource,
          createdAt: now
        }
      })
      await trimActivities(ctx.familyId)
    } else {
      const it = items[0]
      const source =
        defaultSource === 'agent' || it.source === 'agent' ? 'agent' : 'ui'
      await appendActivity({
        familyId: ctx.familyId,
        itemId: it._id,
        action: 'remove',
        actorOpenid: openid,
        itemName: it.name || '',
        source,
        createdAt: now,
        ...(placeForSingle || {})
      })
    }
  } catch (e) {
    console.error('removeMany activities failed', e)
  }

  return ok({
    removed: true,
    itemIds: items.map((it) => it._id),
    count: items.length
  })
}

/**
 * 把多条物资合成一条：保留第一条，数量相加，删除其余。
 * 须同空间；单位冲突则拒绝。可选 name 作为合并后名称。
 */
async function mergeItems(openid, event, options = {}) {
  const ctx = await resolveFamilyContext(openid, options.familyCtx)
  if (ctx.error) return ctx.error

  const rawIds = Array.isArray(event.itemIds) ? event.itemIds : []
  const ids = []
  const seen = {}
  rawIds.forEach((id) => {
    const s = String(id || '').trim()
    if (!s || seen[s]) return
    seen[s] = true
    ids.push(s)
  })
  if (ids.length < 2) {
    return fail('INVALID_MERGE', '至少需要两条物资才能合并')
  }
  if (ids.length > 20) {
    return fail('INVALID_MERGE', '一次合并过多')
  }

  const snaps = await Promise.all(
    ids.map((id) => db.collection('items').doc(id).get().catch(() => null))
  )
  const items = []
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i]
    if (!snap || !snap.data) return fail('NOT_FOUND', '物资不存在')
    if (snap.data.familyId !== ctx.familyId) {
      return fail('FORBIDDEN', '无权操作该物资')
    }
    items.push({ _id: ids[i], ...snap.data })
  }

  const spaceId = items[0].spaceId
  if (!spaceId || items.some((it) => it.spaceId !== spaceId)) {
    return fail('INVALID_MERGE', '只能合并同一空间下的物资')
  }

  const units = [
    ...new Set(items.map((it) => String(it.unit || '').trim()).filter(Boolean))
  ]
  if (units.length > 1) {
    return fail('INVALID_MERGE', '单位不一致，无法合并')
  }
  const unit = units[0] || String(items[0].unit || '').trim()

  let quantity = 0
  for (let i = 0; i < items.length; i++) {
    const q = normalizeQuantity(items[i].quantity, 0)
    if (q === null) return fail('INVALID_QUANTITY', '数量无效')
    quantity += q
  }

  const keep = items[0]
  const absorbed = items.slice(1)
  const nameRaw = event.name != null ? String(event.name).trim() : ''
  const name = nameRaw || String(keep.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入物资名称')

  let locationId = keep.locationId || null
  if (!locationId) {
    const withLoc = items.find((it) => it.locationId)
    if (withLoc) locationId = withLoc.locationId
  }

  const tagIds = []
  const tagSeen = {}
  items.forEach((it) => {
    ;(it.tagIds || []).forEach((tid) => {
      const id = String(tid || '').trim()
      if (!id || tagSeen[id]) return
      tagSeen[id] = true
      tagIds.push(id)
    })
  })

  const dateVals = (key) =>
    items
      .map((it) => it[key])
      .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d)))
      .map(String)
      .sort()
  const expireList = dateVals('expireDate')
  const productionList = dateVals('productionDate')
  const expireDate = expireList.length ? expireList[0] : null
  const productionDate = productionList.length ? productionList[0] : null

  const notes = [
    ...new Set(items.map((it) => String(it.note || '').trim()).filter(Boolean))
  ]
  const note = notes.join('；')

  const now = Date.now()
  const source = event.source === 'agent' ? 'agent' : 'ui'
  const patch = {
    name,
    quantity,
    unit,
    note,
    spaceId,
    locationId,
    tagIds,
    productionDate,
    expireDate,
    updatedAt: now
  }

  const hadSub = (
    await Promise.all(items.map((it) => hasExpireSub(it._id, openid)))
  ).some(Boolean)

  await db.collection('items').doc(keep._id).update({ data: patch })

  const place = await snapshotPlace(ctx.familyId, spaceId, locationId, null)
  for (let i = 0; i < absorbed.length; i++) {
    const it = absorbed[i]
    await db.collection('items').doc(it._id).remove()
    await removeExpireSubsForItem(it._id).catch((e) => {
      console.warn('removeExpireSubsForItem failed', it._id, e)
    })
    await appendActivity({
      familyId: ctx.familyId,
      itemId: it._id,
      action: 'remove',
      actorOpenid: openid,
      itemName: it.name || '',
      summary: `合并入「${name}」`,
      source,
      createdAt: now,
      ...place
    })
  }

  if (absorbed.length) {
    await bumpItemCount(ctx.familyId, -absorbed.length)
  }

  try {
    await syncExpireSub(ctx.familyId, keep._id, openid, hadSub, expireDate)
  } catch (e) {
    console.warn('syncExpireSub merge failed', keep._id, e)
  }

  await appendActivity({
    familyId: ctx.familyId,
    itemId: keep._id,
    action: 'update',
    actorOpenid: openid,
    itemName: name,
    quantity,
    unit,
    summary: `合并了 ${items.length} 条`,
    changedFields: ['quantity', 'name'],
    source,
    createdAt: now,
    ...place
  })

  const mine = await hasExpireSub(keep._id, openid)
  return ok({
    _id: keep._id,
    ...keep,
    ...patch,
    expireReminderEnabled: mine,
    mergedCount: items.length,
    absorbedIds: absorbed.map((it) => it._id)
  })
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

  // 优先 count()（单次查询）；失败再按页累加兜底
  try {
    const counted = await db.collection('items').where({ familyId: ctx.familyId }).count()
    return ok({ total: Number(counted && counted.total) || 0 })
  } catch (err) {
    console.warn('countItems count() fallback', err && err.message)
  }

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

/**
 * 清单首页一次取齐：当前空间列表 + 全家件数 + 临期横幅（最急一条 + 件数）。
 * 少几次客户端 callFunction（仍多笔 DB，但调用次数合计更低）。
 */
async function home(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  const spaceId = event.spaceId ? String(event.spaceId) : ''
  const today = shanghaiTodayYmd()
  const end = addDaysYmd(today, 3)
  const expiringWhere = {
    familyId: ctx.familyId,
    expireDate: _.lte(end)
  }

  const listWhere = { familyId: ctx.familyId }
  if (spaceId) listWhere.spaceId = spaceId

  const [listRes, counted, subscribed, expiringRes, expiringCounted] = await Promise.all([
    db
      .collection('items')
      .where(listWhere)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get(),
    db
      .collection('items')
      .where({ familyId: ctx.familyId })
      .count()
      .catch(() => null),
    subscribedItemSet(ctx.familyId, openid),
    db
      .collection('items')
      .where(expiringWhere)
      .orderBy('expireDate', 'asc')
      .limit(1)
      .get()
      .catch(async () => {
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
          .slice(0, 1)
        return { data: filtered }
      }),
    db
      .collection('items')
      .where(expiringWhere)
      .count()
      .catch(() => null)
  ])

  let total = Number(counted && counted.total) || 0
  if (!counted) {
    total = (listRes.data || []).length
  }

  const list = (listRes.data || []).map((item) => overlayExpireReminder(item, subscribed))
  const rawTop = ((expiringRes && expiringRes.data) || []).find((item) => item && item.expireDate)
  let expiringTop = null
  if (rawTop) {
    const withPlace = await attachPlaceNames(ctx.familyId, [
      overlayExpireReminder(rawTop, subscribed)
    ])
    expiringTop = withPlace[0] || null
  }

  let expiringCount = Number(expiringCounted && expiringCounted.total) || 0
  if (!expiringCounted) {
    expiringCount = expiringTop ? 1 : 0
  } else if (expiringTop && expiringCount < 1) {
    expiringCount = 1
  }

  return ok({
    list,
    total,
    expiringTop,
    expiringCount,
    today,
    windowEnd: end
  })
}

  return {
    createItem,
    createMany,
    updateItem,
    removeItem,
    removeMany,
    mergeItems,
    getItem,
    listItems,
    countItems,
    searchItems,
    listExpiring,
    home
  }
}
