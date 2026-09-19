const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const { touchFamilyTree } = require('./familyTree')
const locationWriter = require('./locationWrite')(db)

const DEFAULT_SPACE_NAME = '仓库'
const DEFAULT_COVER_KEY = 'default-indoor'

function ok(data) {
  return { ok: true, data }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function membershipId(openid, familyId) {
  return `${openid}_${familyId}`
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

async function backfillItemsWithoutSpace(familyId, spaceId) {
  const res = await db
    .collection('items')
    .where({
      familyId,
      spaceId: _.exists(false)
    })
    .limit(100)
    .get()
  const list = res.data || []
  const now = Date.now()
  await Promise.all(
    list.map((item) =>
      db.collection('items').doc(item._id).update({
        data: {
          spaceId,
          updatedAt: now
        }
      })
    )
  )
  // Also backfill empty string / null if any (best-effort second pass)
  const nullish = await db
    .collection('items')
    .where({ familyId, spaceId: null })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))
  await Promise.all(
    (nullish.data || []).map((item) =>
      db.collection('items').doc(item._id).update({
        data: { spaceId, updatedAt: now }
      })
    )
  )
  return list.length + ((nullish.data && nullish.data.length) || 0)
}

/**
 * Ensure family has a default warehouse. Returns the default (or first) space.
 */
async function ensureDefaultSpace(familyId) {
  const existing = await listSpacesForFamily(familyId)
  if (existing.length) {
    const preferred = existing.find((s) => s.isDefault) || existing[0]
    await backfillItemsWithoutSpace(familyId, preferred._id)
    return preferred
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
  const space = { _id: addRes._id, ...doc }
  await backfillItemsWithoutSpace(familyId, space._id)
  return space
}

async function ensureDefault(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error
  const space = await ensureDefaultSpace(ctx.familyId)
  return ok(space)
}

async function listSpaces(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error
  const list = await listSpacesForFamily(ctx.familyId)
  return ok({ list })
}

async function createSpace(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入空间名称')

  const now = Date.now()
  const existing = await listSpacesForFamily(ctx.familyId)
  const doc = {
    familyId: ctx.familyId,
    name,
    floorId: event.floorId || null,
    isDefault: existing.length === 0,
    coverKey: event.coverKey || DEFAULT_COVER_KEY,
    createdAt: now,
    updatedAt: now
  }
  const addRes = await db.collection('spaces').add({ data: doc })
  return ok({ _id: addRes._id, ...doc })
}

async function updateSpace(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const spaceId = event.spaceId
  if (!spaceId) return fail('INVALID_ID', '缺少 spaceId')

  const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '空间不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该空间')
  }

  const patch = { updatedAt: Date.now() }
  if (event.name !== undefined) {
    const name = String(event.name || '').trim()
    if (!name) return fail('INVALID_NAME', '请输入空间名称')
    patch.name = name
  }
  if (event.coverKey !== undefined) {
    patch.coverKey = String(event.coverKey || DEFAULT_COVER_KEY)
  }

  await db.collection('spaces').doc(spaceId).update({ data: patch })
  return ok({ _id: spaceId, ...snap.data, ...patch })
}

async function removeSpace(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const spaceId = event.spaceId
  if (!spaceId) return fail('INVALID_ID', '缺少 spaceId')

  const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '空间不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该空间')
  }

  // 默认仓库只能改名，不能删
  if (snap.data.isDefault) {
    return fail('DEFAULT_SPACE', '默认仓库只能改名，不能删除')
  }

  const all = await listSpacesForFamily(ctx.familyId)
  if (all.length <= 1) {
    return fail('LAST_SPACE', '至少保留一个空间')
  }

  const target =
    all.find((s) => s._id !== spaceId && s.isDefault) ||
    all.find((s) => s._id !== spaceId)
  if (!target) {
    return fail('LAST_SPACE', '至少保留一个空间')
  }

  const now = Date.now()

  // 物品迁到默认仓库（或其它保留空间），并清掉具体位置
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const itemRes = await db
      .collection('items')
      .where({ familyId: ctx.familyId, spaceId })
      .limit(100)
      .get()
    const items = itemRes.data || []
    if (!items.length) break
    await Promise.all(
      items.map((item) =>
        db.collection('items').doc(item._id).update({
          data: {
            spaceId: target._id,
            locationId: null,
            updatedAt: now
          }
        })
      )
    )
    if (items.length < 100) break
  }

  // 删掉该空间下位置
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const locRes = await db
      .collection('locations')
      .where({ spaceId })
      .limit(100)
      .get()
    const locs = locRes.data || []
    if (!locs.length) break
    await Promise.all(locs.map((l) => db.collection('locations').doc(l._id).remove()))
    if (locs.length < 100) break
  }

  await db.collection('spaces').doc(spaceId).remove()
  return ok({
    removed: true,
    spaceId,
    migratedTo: target._id,
    migratedToName: target.name
  })
}

async function getSpaceInFamily(spaceId, familyId) {
  const snap = await db.collection('spaces').doc(spaceId).get().catch(() => null)
  if (!snap || !snap.data) return null
  if (snap.data.familyId !== familyId) return null
  return { _id: spaceId, ...snap.data }
}

async function listLocations(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const spaceId = event.spaceId
  if (!spaceId) return fail('INVALID_ID', '缺少 spaceId')

  const space = await getSpaceInFamily(spaceId, ctx.familyId)
  if (!space) return fail('NOT_FOUND', '空间不存在')

  const res = await db
    .collection('locations')
    .where({ familyId: ctx.familyId, spaceId })
    .limit(100)
    .get()
  const list = (res.data || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  return ok({ list })
}

async function createLocation(openid, event) {
  return locationWriter.createLocation(openid, event)
}

async function updateLocation(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const locationId = event.locationId
  if (!locationId) return fail('INVALID_ID', '缺少 locationId')

  const snap = await db.collection('locations').doc(locationId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '位置不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该位置')
  }

  const patch = { updatedAt: Date.now() }
  if (event.name !== undefined) {
    const name = String(event.name || '').trim()
    if (!name) return fail('INVALID_NAME', '请输入位置名称')
    patch.name = name
  }

  await db.collection('locations').doc(locationId).update({ data: patch })
  return ok({ _id: locationId, ...snap.data, ...patch })
}

async function removeLocation(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const locationId = event.locationId
  if (!locationId) return fail('INVALID_ID', '缺少 locationId')

  const snap = await db.collection('locations').doc(locationId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '位置不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该位置')
  }

  // Clear locationId on items that point here (keep spaceId)
  const now = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const items = await db
      .collection('items')
      .where({ familyId: ctx.familyId, locationId })
      .limit(100)
      .get()
    const list = items.data || []
    if (!list.length) break
    await Promise.all(
      list.map((item) =>
        db.collection('items').doc(item._id).update({
          data: {
            locationId: null,
            updatedAt: now
          }
        })
      )
    )
    if (list.length < 100) break
  }

  await db.collection('locations').doc(locationId).remove()
  return ok({ removed: true, locationId })
}

async function listItemsBySpace(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const spaceId = event.spaceId
  if (!spaceId) return fail('INVALID_ID', '缺少 spaceId')

  const space = await getSpaceInFamily(spaceId, ctx.familyId)
  if (!space) return fail('NOT_FOUND', '空间不存在')

  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  const res = await db
    .collection('items')
    .where({ familyId: ctx.familyId, spaceId })
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()

  const items = res.data || []
  const locationIds = [
    ...new Set(items.map((i) => i.locationId).filter(Boolean))
  ]
  let locationMap = {}
  if (locationIds.length) {
    const locRes = await db
      .collection('locations')
      .where({ _id: _.in(locationIds) })
      .limit(100)
      .get()
    ;(locRes.data || []).forEach((l) => {
      locationMap[l._id] = l
    })
  }

  const list = items.map((item) => ({
    ...item,
    locationName: item.locationId && locationMap[item.locationId]
      ? locationMap[item.locationId].name
      : ''
  }))

  return ok({ space, list })
}

/** 口袋页：一次云函数拉齐各空间物资，避免 1+N 次 callFunction。 */
async function listPockets(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  let spaces = await listSpacesForFamily(ctx.familyId)
  if (!spaces.length) {
    const space = await ensureDefaultSpace(ctx.familyId)
    await touchFamilyTree(db, ctx.familyId).catch(() => null)
    spaces = space ? [space] : []
  }

  const packs = await Promise.all(
    spaces.map(async (space) => {
      const res = await db
        .collection('items')
        .where({ familyId: ctx.familyId, spaceId: space._id })
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get()
        .catch(async () => {
          const fallback = await db
            .collection('items')
            .where({ familyId: ctx.familyId, spaceId: space._id })
            .limit(limit)
            .get()
          return fallback
        })
      const items = res.data || []
      const locationIds = [...new Set(items.map((i) => i.locationId).filter(Boolean))]
      let locationMap = {}
      if (locationIds.length) {
        const locRes = await db
          .collection('locations')
          .where({ _id: _.in(locationIds) })
          .limit(100)
          .get()
          .catch(() => ({ data: [] }))
        ;(locRes.data || []).forEach((l) => {
          locationMap[l._id] = l
        })
      }
      const list = items.map((item) => ({
        ...item,
        locationName:
          item.locationId && locationMap[item.locationId]
            ? locationMap[item.locationId].name
            : ''
      }))
      return {
        space: {
          _id: space._id,
          name: space.name || '',
          isDefault: !!space.isDefault
        },
        list,
        capped: list.length >= limit
      }
    })
  )

  return ok({ pockets: packs })
}

function callerOpenid() {
  const ctx = cloud.getWXContext()
  return ctx.OPENID || ctx.FROM_OPENID || ''
}

exports.main = async (event) => {
  const OPENID = callerOpenid()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  const action = event && event.action
  try {
    let result
    switch (action) {
      case 'ensureDefault':
        result = await ensureDefault(OPENID)
        break
      case 'list':
        result = await listSpaces(OPENID)
        break
      case 'create':
        result = await createSpace(OPENID, event)
        break
      case 'update':
        result = await updateSpace(OPENID, event)
        break
      case 'remove':
        result = await removeSpace(OPENID, event)
        break
      case 'listLocations':
        result = await listLocations(OPENID, event)
        break
      case 'createLocation':
        result = await createLocation(OPENID, event)
        break
      case 'updateLocation':
        result = await updateLocation(OPENID, event)
        break
      case 'removeLocation':
        result = await removeLocation(OPENID, event)
        break
      case 'listItemsBySpace':
        result = await listItemsBySpace(OPENID, event)
        break
      case 'listPockets':
        result = await listPockets(OPENID, event)
        break
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
    if (
      result &&
      result.ok &&
      (action === 'ensureDefault' ||
        action === 'create' ||
        action === 'update' ||
        action === 'remove' ||
        action === 'createLocation' ||
        action === 'updateLocation' ||
        action === 'removeLocation')
    ) {
      const ctx = await resolveFamilyContext(OPENID)
      if (!ctx.error) await touchFamilyTree(db, ctx.familyId)
    }
    return result
  } catch (e) {
    console.error('space error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}

// Exported for potential shared testing; item CF duplicates ensure helpers
exports._internal = {
  ensureDefaultSpace,
  listSpacesForFamily,
  getSpaceInFamily
}
