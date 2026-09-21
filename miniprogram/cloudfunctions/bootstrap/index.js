/**
 * 清单首页只读聚合。纯增量：不调用、不修改 family/space/item/activity。
 * 身份（users + memberships）只解析一次，再并行拼盘。
 *
 * action: home
 * 入参: { spaceId?, limit? }
 * 出参: { family, spaces, board, cursor }
 */
const cloud = require('wx-server-sdk')
const entitlements = require('./entitlements')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_SPACE_NAME = '仓库'
const DEFAULT_COVER_KEY = 'default-indoor'

const THEME_IDS = [
  'orange',
  'red',
  'blue',
  'matcha',
  'milk',
  'taro',
  'sakura',
  'coral',
  'mint',
  'warm-gray',
  'indigo',
  'amber',
  'forest',
  'berry',
  'clay',
  'lavender',
  'olive'
]
const DEFAULT_BACKGROUND = { type: 'theme', value: 'orange' }

function ok(data) {
  return { ok: true, data }
}

function fail(code, message) {
  return { ok: false, code, message }
}

function membershipId(openid, familyId) {
  return `${openid}_${familyId}`
}

function normalizeBackground(raw) {
  try {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_BACKGROUND }
    const type = raw.type
    const value = String(raw.value || '').trim()
    if (type === 'theme' && THEME_IDS.includes(value)) {
      return { type: 'theme', value }
    }
  } catch (e) {
    // ignore
  }
  return { ...DEFAULT_BACKGROUND }
}

function isCapacityAdmin(openid) {
  const admin = String(process.env.ADMIN_OPENID || '').trim()
  return !!admin && openid === admin
}

function userProfile(user) {
  return {
    nickname: String((user && user.nickname) || '').trim(),
    avatarUrl: String((user && user.avatarUrl) || '').trim()
  }
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

function sortSpaces(list) {
  const spaces = list || []
  spaces.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return (a.createdAt || 0) - (b.createdAt || 0)
  })
  return spaces
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
    avatarUrl: '',
    updatedAt: now
  }
  await ref.set({ data: doc })
  return { _id: openid, ...doc }
}

/**
 * 身份一次：user → membership + family + subscription 并行。
 */
async function loadSession(openid) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }

  const mid = membershipId(openid, familyId)
  const [mem, fam, subSnap] = await Promise.all([
    db.collection('memberships').doc(mid).get().catch(() => null),
    db.collection('families').doc(familyId).get().catch(() => null),
    db.collection('familySubscriptions').doc(familyId).get().catch(() => null)
  ])
  if (!mem || !mem.data) {
    return { error: fail('NO_FAMILY', '尚未加入家庭') }
  }
  if (!fam || !fam.data) {
    return { error: fail('NO_FAMILY', '家庭不存在') }
  }

  const sub = subSnap && subSnap.data ? subSnap.data : null
  const now = Date.now()
  const effective = entitlements.resolveEffectiveFromSub(sub, now)
  let itemCount =
    fam.data.itemCount == null || !Number.isFinite(Number(fam.data.itemCount))
      ? null
      : Number(fam.data.itemCount)
  if (itemCount != null && itemCount < 0) itemCount = 0

  const family = {
    _id: familyId,
    name: fam.data.name,
    inviteCode: fam.data.inviteCode,
    ownerOpenid: fam.data.ownerOpenid,
    memberCount: fam.data.memberCount || 0,
    createdAt: fam.data.createdAt,
    background: normalizeBackground(fam.data.background),
    expireReminderEnabled:
      fam.data.expireReminderEnabled === undefined
        ? true
        : fam.data.expireReminderEnabled !== false,
    isOwner: fam.data.ownerOpenid === openid,
    isAdmin: isCapacityAdmin(openid),
    itemCount,
    entitlement: {
      planId: effective.planId,
      active: effective.active,
      expiresAt: effective.expiresAt,
      itemLimit: effective.itemLimit,
      memberLimit: effective.memberLimit,
      familyLimit: effective.familyLimit,
      activityLimit: effective.activityLimit,
      product: effective.product
    },
    profile: userProfile(user)
  }

  return { familyId, openid, user, family }
}

async function listSpacesForFamily(familyId) {
  const res = await db.collection('spaces').where({ familyId }).limit(100).get()
  return sortSpaces(res.data || [])
}

/** 无空间时懒建默认仓（与 space.ensureDefault 行为对齐；不重建家庭树） */
async function ensureSpaces(familyId) {
  const existing = await listSpacesForFamily(familyId)
  if (existing.length) return existing
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
  return [{ _id: addRes._id, ...doc }]
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

async function loadBoard(familyId, openid, event) {
  const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 100)
  const spaceId = event.spaceId ? String(event.spaceId) : ''
  const today = shanghaiTodayYmd()
  const end = addDaysYmd(today, 3)
  const expiringWhere = {
    familyId,
    expireDate: _.lte(end)
  }
  const listWhere = { familyId }
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
      .where({ familyId })
      .count()
      .catch(() => null),
    subscribedItemSet(familyId, openid),
    db
      .collection('items')
      .where(expiringWhere)
      .orderBy('expireDate', 'asc')
      .limit(1)
      .get()
      .catch(async () => {
        const all = await db.collection('items').where({ familyId }).limit(100).get()
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
    const withPlace = await attachPlaceNames(familyId, [
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

  return {
    list,
    total,
    expiringTop,
    expiringCount,
    today,
    windowEnd: end
  }
}

async function loadCursor(familyId) {
  const res = await db
    .collection('activities')
    .where({ familyId })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))
  const row = (res.data && res.data[0]) || null
  return {
    _id: row ? row._id : '',
    createdAt: row ? Number(row.createdAt) || 0 : 0
  }
}

async function home(openid, event) {
  const session = await loadSession(openid)
  if (session.error) return session.error

  const { familyId, family } = session
  const [spaces, board, cursor] = await Promise.all([
    ensureSpaces(familyId),
    loadBoard(familyId, openid, event || {}),
    loadCursor(familyId)
  ])

  return ok({
    family,
    spaces: { list: spaces },
    board,
    cursor
  })
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

  const action = (event && event.action) || 'home'
  try {
    switch (action) {
      case 'home':
        return await home(OPENID, event)
      default:
        return fail('UNKNOWN_ACTION', `未知 action: ${action}`)
    }
  } catch (e) {
    console.error('bootstrap error', action, e)
    return fail('INTERNAL', e.message || String(e))
  }
}
