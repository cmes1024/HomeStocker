const cloud = require('wx-server-sdk')
const entitlements = require('./entitlements')

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

async function loadActorProfiles(openids) {
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
      const avatarUrl =
        snap && snap.data && snap.data.avatarUrl
          ? String(snap.data.avatarUrl).trim()
          : ''
      map[id] = { nickname, avatarUrl }
    })
  )
  return map
}

async function resolveActivityEntitlement(familyId) {
  let sub = null
  try {
    const snap = await db.collection('familySubscriptions').doc(familyId).get()
    if (snap && snap.data) sub = snap.data
  } catch (e) {
    sub = null
  }
  const ent = entitlements.resolveEffectiveFromSub(sub)
  const n = Number(ent.activityLimit)
  const activityLimit =
    Number.isFinite(n) && n > 0
      ? n
      : Number(entitlements.PLANS.free.activityLimit) || 30
  return {
    activityLimit,
    active: !!ent.active,
    premiumActivityLimit:
      Number(entitlements.PLANS.capacity_std.activityLimit) || 200
  }
}

async function listActivities(openid, event) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const itemId = event.itemId ? String(event.itemId) : ''
  const where = { familyId: ctx.familyId }
  if (itemId) {
    where.itemId = itemId
  }

  const skip = Math.max(Number(event.skip) || 0, 0)
  const requested = Number(event.limit)

  let feedEnt = null
  let limit
  if (itemId) {
    // 物资详情最近操作：小窗口，不按档位拉满
    limit = Math.min(Math.max(requested || 10, 1), 10)
  } else {
    // 先按加强档上限拉，再按实际档位截断，好与 entitlement 并行
    feedEnt = null
    limit = Math.min(
      Math.max(Number.isFinite(requested) && requested > 0 ? requested : 200, 1),
      200
    )
  }

  let query = db.collection('activities').where(where).orderBy('createdAt', 'desc')
  if (skip > 0) {
    query = query.skip(skip)
  }

  let res
  if (itemId) {
    res = await query.limit(limit).get()
  } else {
    const [ent, listed] = await Promise.all([
      resolveActivityEntitlement(ctx.familyId),
      query.limit(limit).get()
    ])
    feedEnt = ent
    const activityLimit = feedEnt.activityLimit
    const capped = Math.min(
      Math.max(Number.isFinite(requested) && requested > 0 ? requested : activityLimit, 1),
      activityLimit
    )
    res = { data: (listed.data || []).slice(0, capped) }
  }

  const list = res.data || []

  const profiles = await loadActorProfiles(list.map((row) => row.actorOpenid))
  const enriched = list.map((row) => {
    const profile = profiles[row.actorOpenid] || { nickname: '', avatarUrl: '' }
    return {
      ...row,
      actorNickname: profile.nickname || '',
      actorAvatarUrl: profile.avatarUrl || ''
    }
  })

  if (feedEnt) {
    return ok({
      list: enriched,
      activityLimit: feedEnt.activityLimit,
      premiumActivityLimit: feedEnt.premiumActivityLimit,
      active: feedEnt.active
    })
  }
  return ok({ list: enriched })
}

/** 物资域水位：只取最新一条的 id / createdAt，不查昵称。 */
async function cursorActivities(openid) {
  const ctx = await resolveFamilyContext(openid)
  if (ctx.error) return ctx.error

  const res = await db
    .collection('activities')
    .where({ familyId: ctx.familyId })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  const row = (res.data && res.data[0]) || null
  return ok({
    _id: row ? row._id : '',
    createdAt: row ? Number(row.createdAt) || 0 : 0
  })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail('NO_OPENID', '无法识别用户')

  const action = event && event.action
  switch (action) {
    case 'list':
      return await listActivities(OPENID, event || {})
    case 'cursor':
      return await cursorActivities(OPENID)
    default:
      return fail('UNKNOWN_ACTION', '未知操作')
  }
}
