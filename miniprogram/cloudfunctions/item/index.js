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

async function buildNameMaps(familyId, items) {
  const spaceIds = [...new Set((items || []).map((item) => item.spaceId).filter(Boolean))]
  const locationIds = [...new Set((items || []).map((item) => item.locationId).filter(Boolean))]
  const [spacesRes, locationsRes] = await Promise.all([
    spaceIds.length
      ? db.collection('spaces').where({ _id: _.in(spaceIds), familyId }).limit(100).get()
      : Promise.resolve({ data: [] }),
    locationIds.length
      ? db.collection('locations').where({ _id: _.in(locationIds), familyId }).limit(100).get()
      : Promise.resolve({ data: [] })
  ])

  const spaceMap = {}
  const locationMap = {}
  ;(spacesRes.data || []).forEach((space) => {
    spaceMap[space._id] = space.name || ''
  })
  ;(locationsRes.data || []).forEach((location) => {
    locationMap[location._id] = location.name || ''
  })

  return { spaceMap, locationMap }
}

function hydrateItem(item, maps) {
  const spaceMap = (maps && maps.spaceMap) || {}
  const locationMap = (maps && maps.locationMap) || {}
  return {
    ...item,
    spaceName: item.spaceId ? spaceMap[item.spaceId] || '' : '',
    locationName: item.locationId ? locationMap[item.locationId] || '' : ''
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

  const doc = {
    familyId: ctx.familyId,
    name,
    quantity,
    unit,
    note,
    spaceId: spaceRes.spaceId,
    locationId: locRes.locationId,
    createdBy: openid,
    source,
    createdAt: now,
    updatedAt: now
  }

  const addRes = await db.collection('items').add({ data: doc })
  return ok({ _id: addRes._id, ...doc })
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
  return ok({ _id: itemId, ...snap.data, ...patch })
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

  await db.collection('items').doc(itemId).remove()
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

  const item = { _id: itemId, ...snap.data }
  const maps = await buildNameMaps(ctx.familyId, [item])
  return ok(hydrateItem(item, maps))
}

async function listItems(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  const where = { familyId: ctx.familyId }
  if (event.spaceId) {
    where.spaceId = String(event.spaceId)
  }
  const res = await db
    .collection('items')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()
  const list = res.data || []
  const maps = await buildNameMaps(ctx.familyId, list)
  return ok({ list: list.map((item) => hydrateItem(item, maps)) })
}

async function searchItems(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const keyword = String(event.keyword || '').trim()
  const limit = Math.min(Math.max(Number(event.limit) || 20, 1), 50)

  if (!keyword) {
    return listItems(openid, { limit, spaceId: event.spaceId })
  }

  const where = { familyId: ctx.familyId }
  if (event.spaceId) {
    where.spaceId = String(event.spaceId)
  }

  const res = await db
    .collection('items')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  const lower = keyword.toLowerCase()
  const list = (res.data || [])
    .filter((item) => String(item.name || '').toLowerCase().includes(lower))
    .slice(0, limit)

  const maps = await buildNameMaps(ctx.familyId, list)
  return ok({ list: list.map((item) => hydrateItem(item, maps)) })
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
      case 'search':
        return await searchItems(OPENID, event)
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('item error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}
