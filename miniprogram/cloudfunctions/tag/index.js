const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_TAG_NAMES = ['药品', '饮料', '工具', '衣物']

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

async function listTagsForFamily(familyId) {
  const res = await db
    .collection('tags')
    .where({ familyId })
    .limit(100)
    .get()
  const list = res.data || []
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  return list
}

/**
 * 仅当家庭尚未打过种子标记时写入默认标签；用户删掉默认标签后不补种。
 */
async function ensureDefaults(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const famSnap = await db.collection('families').doc(ctx.familyId).get().catch(() => null)
  if (!famSnap || !famSnap.data) {
    return fail('NO_FAMILY', '家庭不存在')
  }

  if (famSnap.data.tagsSeededAt) {
    const list = await listTagsForFamily(ctx.familyId)
    return ok({ list, seeded: false })
  }

  const existing = await listTagsForFamily(ctx.familyId)
  if (existing.length) {
    await db.collection('families').doc(ctx.familyId).update({
      data: { tagsSeededAt: Date.now() }
    })
    return ok({ list: existing, seeded: false })
  }

  const now = Date.now()
  const created = []
  for (let i = 0; i < DEFAULT_TAG_NAMES.length; i++) {
    const name = DEFAULT_TAG_NAMES[i]
    const doc = {
      familyId: ctx.familyId,
      name,
      isDefault: true,
      createdAt: now + i,
      updatedAt: now + i
    }
    const addRes = await db.collection('tags').add({ data: doc })
    created.push({ _id: addRes._id, ...doc })
  }

  await db.collection('families').doc(ctx.familyId).update({
    data: { tagsSeededAt: now }
  })

  return ok({ list: created, seeded: true })
}

async function listTags(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error
  const list = await listTagsForFamily(ctx.familyId)
  return ok({ list })
}

async function createTag(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const name = String(event.name || '').trim().slice(0, 20)
  if (!name) return fail('INVALID_NAME', '请输入标签名称')

  const existing = await listTagsForFamily(ctx.familyId)
  if (existing.some((t) => t.name === name)) {
    return fail('DUPLICATE_NAME', '已有同名标签')
  }

  const now = Date.now()
  const doc = {
    familyId: ctx.familyId,
    name,
    isDefault: false,
    createdAt: now,
    updatedAt: now
  }
  const addRes = await db.collection('tags').add({ data: doc })
  return ok({ _id: addRes._id, ...doc })
}

async function updateTag(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const tagId = String(event.tagId || '').trim()
  if (!tagId) return fail('INVALID_ID', '缺少 tagId')

  const name = String(event.name || '').trim().slice(0, 20)
  if (!name) return fail('INVALID_NAME', '请输入标签名称')

  const snap = await db.collection('tags').doc(tagId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '标签不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该标签')
  }

  const siblings = await listTagsForFamily(ctx.familyId)
  if (siblings.some((t) => t._id !== tagId && t.name === name)) {
    return fail('DUPLICATE_NAME', '已有同名标签')
  }

  const patch = { name, updatedAt: Date.now() }
  await db.collection('tags').doc(tagId).update({ data: patch })
  return ok({ _id: tagId, ...snap.data, ...patch })
}

async function stripTagFromItems(familyId, tagId) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await db
      .collection('items')
      .where({
        familyId,
        tagIds: tagId
      })
      .limit(100)
      .get()
    const list = res.data || []
    if (!list.length) break
    const now = Date.now()
    await Promise.all(
      list.map((item) => {
        const next = (item.tagIds || []).filter((id) => id !== tagId)
        return db.collection('items').doc(item._id).update({
          data: { tagIds: next, updatedAt: now }
        })
      })
    )
    if (list.length < 100) break
  }
}

async function removeTag(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const tagId = String(event.tagId || '').trim()
  if (!tagId) return fail('INVALID_ID', '缺少 tagId')

  const snap = await db.collection('tags').doc(tagId).get().catch(() => null)
  if (!snap || !snap.data) return fail('NOT_FOUND', '标签不存在')
  if (snap.data.familyId !== ctx.familyId) {
    return fail('FORBIDDEN', '无权操作该标签')
  }

  await stripTagFromItems(ctx.familyId, tagId)
  await db.collection('tags').doc(tagId).remove()
  return ok({ removed: true, tagId })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return fail('UNAUTHORIZED', '未登录')
  }

  const action = event && event.action
  try {
    switch (action) {
      case 'ensureDefaults':
        return await ensureDefaults(OPENID)
      case 'list':
        return await listTags(OPENID)
      case 'create':
        return await createTag(OPENID, event)
      case 'update':
        return await updateTag(OPENID, event)
      case 'remove':
        return await removeTag(OPENID, event)
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('tag error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}
