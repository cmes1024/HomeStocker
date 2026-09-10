const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_LEN = 6

const DEFAULT_BACKGROUND = {
  type: 'gradient',
  value: 'linear-gradient(165deg, #E8F1F2 0%, #C5D9DE 48%, #8FB3BC 100%)'
}

function ok(data) {
  return { ok: true, data }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function membershipId(openid, familyId) {
  return `${openid}_${familyId}`
}

function randomInviteCode() {
  let code = ''
  for (let i = 0; i < INVITE_LEN; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]
  }
  return code
}

function normalizeBackground(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BACKGROUND }
  const type = raw.type
  const value = String(raw.value || '').trim()
  if (!value) return { ...DEFAULT_BACKGROUND }
  if (type === 'gradient' || type === 'solid' || type === 'image') {
    return { type, value }
  }
  return { ...DEFAULT_BACKGROUND }
}

function familySummary(familyId, family, openid) {
  return {
    _id: familyId,
    name: family.name,
    inviteCode: family.inviteCode,
    ownerOpenid: family.ownerOpenid,
    memberCount: family.memberCount || 0,
    createdAt: family.createdAt,
    background: normalizeBackground(family.background),
    isOwner: family.ownerOpenid === openid
  }
}

async function ensureUser(openid) {
  const ref = db.collection('users').doc(openid)
  try {
    const snap = await ref.get()
    if (snap && snap.data && Object.keys(snap.data).length) {
      return { _id: openid, ...snap.data }
    }
  } catch (e) {
    // 文档不存在则创建
  }
  const now = Date.now()
  const doc = {
    _openid: openid,
    currentFamilyId: null,
    nickname: '',
    updatedAt: now
  }
  await ref.set({ data: doc })
  return { _id: openid, ...doc }
}

async function createUniqueInviteCode(maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const inviteCode = randomInviteCode()
    const exists = await db.collection('families').where({ inviteCode }).count()
    if ((exists.total || 0) === 0) return inviteCode
  }
  throw new Error('INVITE_CODE_EXHAUSTED')
}

async function pickOtherFamilyId(openid, excludeFamilyId) {
  const res = await db
    .collection('memberships')
    .where({ openid })
    .limit(20)
    .get()
  const other = (res.data || []).find((m) => m.familyId !== excludeFamilyId)
  return other ? other.familyId : null
}

async function setCurrentFamily(openid, familyId) {
  await db.collection('users').doc(openid).update({
    data: {
      currentFamilyId: familyId,
      updatedAt: Date.now()
    }
  })
}

async function createFamily(openid, event) {
  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入家庭名称')

  await ensureUser(openid)

  const now = Date.now()
  let inviteCode
  try {
    inviteCode = await createUniqueInviteCode()
  } catch (e) {
    return fail('INVITE_CODE_EXHAUSTED', '邀请码生成失败，请重试')
  }

  const background = event.background
    ? normalizeBackground(event.background)
    : { ...DEFAULT_BACKGROUND }

  const addRes = await db.collection('families').add({
    data: {
      name,
      inviteCode,
      ownerOpenid: openid,
      memberCount: 1,
      background,
      createdAt: now
    }
  })
  const familyId = addRes._id

  await db.collection('memberships').doc(membershipId(openid, familyId)).set({
    data: {
      openid,
      familyId,
      joinedAt: now
    }
  })

  await setCurrentFamily(openid, familyId)

  return ok({
    _id: familyId,
    name,
    inviteCode,
    ownerOpenid: openid,
    memberCount: 1,
    background,
    createdAt: now,
    isOwner: true
  })
}

async function joinFamily(openid, event) {
  const inviteCode = String(event.inviteCode || '')
    .trim()
    .toUpperCase()
  if (!inviteCode || inviteCode.length !== INVITE_LEN) {
    return fail('INVALID_CODE', '邀请码无效')
  }

  await ensureUser(openid)

  const found = await db.collection('families').where({ inviteCode }).limit(1).get()
  if (!found.data || !found.data.length) {
    return fail('INVALID_CODE', '邀请码无效')
  }

  const family = found.data[0]
  const familyId = family._id
  const now = Date.now()
  const mid = membershipId(openid, familyId)

  const existing = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (existing && existing.data) {
    return fail('ALREADY_IN_FAMILY', '已加入该家庭')
  }

  try {
    await db.collection('memberships').doc(mid).set({
      data: {
        openid,
        familyId,
        joinedAt: now
      }
    })
  } catch (e) {
    return fail('ALREADY_IN_FAMILY', '已加入该家庭')
  }

  await db.collection('families').doc(familyId).update({
    data: {
      memberCount: _.inc(1)
    }
  })

  await setCurrentFamily(openid, familyId)

  return ok(familySummary(familyId, {
    ...family,
    memberCount: (family.memberCount || 0) + 1
  }, openid))
}

async function getMyFamily(openid) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) {
    return fail('NO_FAMILY', '家庭不存在')
  }

  return ok(familySummary(familyId, fam.data, openid))
}

async function listMyFamilies(openid) {
  const user = await ensureUser(openid)
  const memRes = await db.collection('memberships').where({ openid }).limit(20).get()
  const memberships = memRes.data || []
  if (!memberships.length) {
    return ok({ currentFamilyId: null, list: [] })
  }

  const ids = memberships.map((m) => m.familyId)
  const famRes = await db
    .collection('families')
    .where({ _id: _.in(ids) })
    .limit(20)
    .get()
  const byId = {}
  ;(famRes.data || []).forEach((f) => {
    byId[f._id] = f
  })

  const list = memberships
    .map((m) => {
      const f = byId[m.familyId]
      if (!f) return null
      return {
        ...familySummary(m.familyId, f, openid),
        joinedAt: m.joinedAt,
        isCurrent: m.familyId === user.currentFamilyId
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))

  return ok({
    currentFamilyId: user.currentFamilyId || null,
    list
  })
}

async function switchFamily(openid, event) {
  const familyId = String(event.familyId || '').trim()
  if (!familyId) return fail('INVALID_FAMILY', '家庭无效')

  await ensureUser(openid)
  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) {
    return fail('NOT_MEMBER', '未加入该家庭')
  }

  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) {
    return fail('NO_FAMILY', '家庭不存在')
  }

  await setCurrentFamily(openid, familyId)
  return ok(familySummary(familyId, fam.data, openid))
}

async function updateBackground(openid, event) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const type = String(event.type || '').trim()
  const value = String(event.value || '').trim()
  if (!['gradient', 'solid', 'image'].includes(type) || !value) {
    return fail('INVALID_BACKGROUND', '背景设置无效')
  }
  if (type === 'solid' && !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return fail('INVALID_BACKGROUND', '颜色格式无效')
  }
  if (type === 'gradient' && !value.includes('gradient')) {
    return fail('INVALID_BACKGROUND', '渐变格式无效')
  }
  if (type === 'image' && !value.startsWith('cloud://')) {
    return fail('INVALID_BACKGROUND', '图片无效')
  }

  const background = { type, value }
  await db.collection('families').doc(familyId).update({
    data: { background }
  })

  const fam = await db.collection('families').doc(familyId).get()
  return ok(familySummary(familyId, { ...fam.data, background }, openid))
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

async function reassignUsersCurrentFamily(familyId) {
  const res = await db.collection('users').where({ currentFamilyId: familyId }).get()
  const now = Date.now()
  await Promise.all(
    (res.data || []).map(async (u) => {
      const nextId = await pickOtherFamilyId(u._id, familyId)
      await db.collection('users').doc(u._id).update({
        data: {
          currentFamilyId: nextId,
          updatedAt: now
        }
      })
    })
  )
}

async function leaveFamily(openid) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) {
    await setCurrentFamily(openid, null)
    return fail('NO_FAMILY', '家庭不存在')
  }

  const family = fam.data

  if (family.ownerOpenid === openid) {
    await removeInBatches(db.collection('items'), { familyId })
    await removeInBatches(db.collection('locations'), { familyId })
    await removeInBatches(db.collection('spaces'), { familyId })
    await removeInBatches(db.collection('memberships'), { familyId })
    await reassignUsersCurrentFamily(familyId)
    await db.collection('families').doc(familyId).remove()

    const nextFamilyId = await pickOtherFamilyId(openid, familyId)
    if (nextFamilyId) {
      await setCurrentFamily(openid, nextFamilyId)
    }
    return ok({ dissolved: true, nextFamilyId: nextFamilyId || null })
  }

  await db.collection('memberships').doc(membershipId(openid, familyId)).remove()
  await db.collection('families').doc(familyId).update({
    data: {
      memberCount: _.inc(-1)
    }
  })

  const nextFamilyId = await pickOtherFamilyId(openid, familyId)
  await setCurrentFamily(openid, nextFamilyId)
  return ok({ left: true, nextFamilyId: nextFamilyId || null })
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
        return await createFamily(OPENID, event)
      case 'join':
        return await joinFamily(OPENID, event)
      case 'getMyFamily':
        return await getMyFamily(OPENID)
      case 'listMyFamilies':
        return await listMyFamilies(OPENID)
      case 'switchFamily':
        return await switchFamily(OPENID, event)
      case 'updateBackground':
        return await updateBackground(OPENID, event)
      case 'leave':
        return await leaveFamily(OPENID)
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('family error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}
