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

async function loadNicknames(openids) {
  const map = {}
  const unique = []
  const seen = {}
  for (let i = 0; i < openids.length; i++) {
    const id = openids[i]
    if (!id || seen[id]) continue
    seen[id] = true
    unique.push(id)
  }
  await Promise.all(
    unique.map(async (id) => {
      const snap = await db.collection('users').doc(id).get().catch(() => null)
      const nickname =
        snap && snap.data && snap.data.nickname
          ? String(snap.data.nickname).trim()
          : ''
      map[id] = nickname
    })
  )
  return map
}

async function listActivities(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50)
  const skip = Math.max(Number(event.skip) || 0, 0)
  const where = { familyId: ctx.familyId }
  if (event.itemId) {
    where.itemId = String(event.itemId)
  }

  let query = db.collection('activities').where(where).orderBy('createdAt', 'desc')
  if (skip > 0) {
    query = query.skip(skip)
  }
  const res = await query.limit(limit).get()
  const list = res.data || []

  const nicknames = await loadNicknames(list.map((row) => row.actorOpenid))
  const enriched = list.map((row) => ({
    ...row,
    actorNickname: nicknames[row.actorOpenid] || ''
  }))

  return ok({ list: enriched })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail('NO_OPENID', '无法识别用户')

  const action = event && event.action
  switch (action) {
    case 'list':
      return await listActivities(OPENID, event || {})
    default:
      return fail('UNKNOWN_ACTION', '未知操作')
  }
}
