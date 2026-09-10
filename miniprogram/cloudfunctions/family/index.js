const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_LEN = 6

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

async function countMemberships(openid) {
  const res = await db.collection('memberships').where({ openid }).count()
  return res.total || 0
}

async function createUniqueInviteCode(maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const inviteCode = randomInviteCode()
    const exists = await db.collection('families').where({ inviteCode }).count()
    if ((exists.total || 0) === 0) return inviteCode
  }
  throw new Error('INVITE_CODE_EXHAUSTED')
}

async function createFamily(openid, event) {
  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入家庭名称')

  await ensureUser(openid)
  if ((await countMemberships(openid)) > 0) {
    return fail('ALREADY_IN_FAMILY', '已加入家庭，无法再创建')
  }

  const now = Date.now()
  let inviteCode
  try {
    inviteCode = await createUniqueInviteCode()
  } catch (e) {
    return fail('INVITE_CODE_EXHAUSTED', '邀请码生成失败，请重试')
  }

  const addRes = await db.collection('families').add({
    data: {
      name,
      inviteCode,
      ownerOpenid: openid,
      memberCount: 1,
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

  await db.collection('users').doc(openid).update({
    data: {
      currentFamilyId: familyId,
      updatedAt: now
    }
  })

  return ok({
    _id: familyId,
    name,
    inviteCode,
    ownerOpenid: openid,
    memberCount: 1,
    createdAt: now
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
  if ((await countMemberships(openid)) > 0) {
    return fail('ALREADY_IN_FAMILY', '已加入家庭，无法再加入')
  }

  const found = await db.collection('families').where({ inviteCode }).limit(1).get()
  if (!found.data || !found.data.length) {
    return fail('INVALID_CODE', '邀请码无效')
  }

  const family = found.data[0]
  const familyId = family._id
  const now = Date.now()
  const mid = membershipId(openid, familyId)

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

  await db.collection('users').doc(openid).update({
    data: {
      currentFamilyId: familyId,
      updatedAt: now
    }
  })

  return ok({
    _id: familyId,
    name: family.name,
    inviteCode: family.inviteCode,
    ownerOpenid: family.ownerOpenid,
    memberCount: (family.memberCount || 0) + 1,
    createdAt: family.createdAt
  })
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

  const family = fam.data
  return ok({
    _id: familyId,
    name: family.name,
    inviteCode: family.inviteCode,
    ownerOpenid: family.ownerOpenid,
    memberCount: family.memberCount || 0,
    createdAt: family.createdAt,
    isOwner: family.ownerOpenid === openid
  })
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

async function clearUsersCurrentFamily(familyId) {
  const res = await db.collection('users').where({ currentFamilyId: familyId }).get()
  const now = Date.now()
  await Promise.all(
    (res.data || []).map((u) =>
      db.collection('users').doc(u._id).update({
        data: {
          currentFamilyId: null,
          updatedAt: now
        }
      })
    )
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
    await db.collection('users').doc(openid).update({
      data: { currentFamilyId: null, updatedAt: Date.now() }
    })
    return fail('NO_FAMILY', '家庭不存在')
  }

  const family = fam.data
  const now = Date.now()

  if (family.ownerOpenid === openid) {
    await removeInBatches(db.collection('items'), { familyId })
    await removeInBatches(db.collection('memberships'), { familyId })
    await clearUsersCurrentFamily(familyId)
    await db.collection('families').doc(familyId).remove()
    return ok({ dissolved: true })
  }

  await db.collection('memberships').doc(membershipId(openid, familyId)).remove()
  await db.collection('families').doc(familyId).update({
    data: {
      memberCount: _.inc(-1)
    }
  })
  await db.collection('users').doc(openid).update({
    data: {
      currentFamilyId: null,
      updatedAt: now
    }
  })

  return ok({ left: true })
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
