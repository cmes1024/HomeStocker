const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

async function createItem(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入物资名称')

  const quantity = normalizeQuantity(event.quantity, 1)
  if (quantity === null) return fail('INVALID_QUANTITY', '数量无效')

  const note = event.note == null ? '' : String(event.note)
  const source = event.source === 'agent' ? 'agent' : 'ui'
  const now = Date.now()

  const doc = {
    familyId: ctx.familyId,
    name,
    quantity,
    note,
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
  if (event.note !== undefined) {
    patch.note = String(event.note)
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

  return ok({ _id: itemId, ...snap.data })
}

async function listItems(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  const res = await db
    .collection('items')
    .where({ familyId: ctx.familyId })
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()
  return ok({ list: res.data || [] })
}

async function searchItems(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const keyword = String(event.keyword || '').trim()
  const limit = Math.min(Math.max(Number(event.limit) || 20, 1), 50)

  if (!keyword) {
    return listItems(openid, { limit })
  }

  // MVP：拉取近期条目后按 name 简单包含匹配（无全文索引）
  const res = await db
    .collection('items')
    .where({ familyId: ctx.familyId })
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  const lower = keyword.toLowerCase()
  const list = (res.data || [])
    .filter((item) => String(item.name || '').toLowerCase().includes(lower))
    .slice(0, limit)

  return ok({ list })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  // 禁止信任客户端伪造身份
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
