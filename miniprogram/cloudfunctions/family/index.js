const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const { rebuildFamilyTree, deleteFamilyTree } = require('./familyTree')
const entitlements = require('./entitlements')

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_LEN = 6

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
const DEFAULT_BACKGROUND = {
  type: 'theme',
  value: 'orange'
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

function familySummary(familyId, family, openid) {
  return {
    _id: familyId,
    name: family.name,
    inviteCode: family.inviteCode,
    ownerOpenid: family.ownerOpenid,
    memberCount: family.memberCount || 0,
    createdAt: family.createdAt,
    background: normalizeBackground(family.background),
    expireReminderEnabled:
      family.expireReminderEnabled === undefined
        ? true
        : family.expireReminderEnabled !== false,
    isOwner: family.ownerOpenid === openid,
    isAdmin: isCapacityAdmin(openid),
    itemCount:
      family.itemCount == null || !Number.isFinite(Number(family.itemCount))
        ? null
        : Number(family.itemCount)
  }
}

async function loadCapacityFields(familyId, family) {
  const now = Date.now()
  let sub = null
  try {
    const snap = await db.collection('familySubscriptions').doc(familyId).get()
    if (snap && snap.data) sub = snap.data
  } catch (e) {
    sub = null
  }
  const effective = entitlements.resolveEffectiveFromSub(sub, now)
  let itemCount =
    family && family.itemCount != null && Number.isFinite(Number(family.itemCount))
      ? Number(family.itemCount)
      : null
  if (itemCount != null && itemCount < 0) itemCount = 0
  return {
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
    }
  }
}

async function withCapacity(familyId, family, openid) {
  const base = familySummary(familyId, family, openid)
  const cap = await loadCapacityFields(familyId, family)
  return { ...base, ...cap }
}

let capacityCollectionsReady = false
async function ensureCapacityCollections() {
  if (capacityCollectionsReady) return
  const names = ['redeemCodes', 'familySubscriptions']
  await Promise.all(
    names.map(async (name) => {
      try {
        await db.createCollection(name)
      } catch (e) {
        // 已存在
      }
    })
  )
  capacityCollectionsReady = true
}

function generatePlainCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 12; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

async function writeFamilyEntitlementSnapshot(familyId, effective) {
  try {
    await db.collection('families').doc(familyId).update({
      data: {
        entitlement: {
          planId: effective.planId,
          expiresAt: effective.expiresAt,
          itemLimit: effective.itemLimit,
          memberLimit: effective.memberLimit,
          familyLimit: effective.familyLimit,
          activityLimit: effective.activityLimit
        }
      }
    })
  } catch (e) {
    console.warn('writeFamilyEntitlementSnapshot failed', familyId, e && e.message)
  }
}

async function listMembershipFamilyIds(openid) {
  const res = await db.collection('memberships').where({ openid }).limit(100).get()
  const rows = (res && res.data) || []
  const ids = []
  for (let i = 0; i < rows.length; i++) {
    const fid = rows[i] && rows[i].familyId
    if (fid) ids.push(fid)
  }
  return ids
}

/** 用户是否已有任一家有效加强版（familyLimit 不限） */
async function userHasUnlimitedFamilySlot(openid, now = Date.now()) {
  const familyIds = await listMembershipFamilyIds(openid)
  for (let i = 0; i < familyIds.length; i++) {
    try {
      const snap = await db.collection('familySubscriptions').doc(familyIds[i]).get()
      if (!snap || !snap.data) continue
      const effective = entitlements.resolveEffectiveFromSub(snap.data, now)
      if (effective.active && effective.familyLimit == null) return true
    } catch (e) {
      // 无订阅文档
    }
  }
  return false
}

/**
 * 用户可加入的家庭数：无加强版解锁时按 free.familyLimit。
 * 已超额不踢，只拦新增 create/join。
 */
async function assertUserFamilyCapacity(openid) {
  const freeLimit = entitlements.PLANS.free.familyLimit
  if (freeLimit == null) return null
  const familyIds = await listMembershipFamilyIds(openid)
  if (familyIds.length < freeLimit) return null
  if (await userHasUnlimitedFamilySlot(openid)) return null
  return fail(
    'FAMILY_LIMIT_REACHED',
    `已达免费家庭上限（${freeLimit} 家），可到家庭页兑换内测加强版`
  )
}

/** 目标家庭人数：按该家订阅的 memberLimit；已超员不踢，只拦 join */
async function assertMemberCapacity(familyId, family) {
  const now = Date.now()
  let sub = null
  try {
    const snap = await db.collection('familySubscriptions').doc(familyId).get()
    if (snap && snap.data) sub = snap.data
  } catch (e) {
    sub = null
  }
  const effective = entitlements.resolveEffectiveFromSub(sub, now)
  if (effective.memberLimit == null) return null
  const count =
    family && family.memberCount != null && Number.isFinite(Number(family.memberCount))
      ? Number(family.memberCount)
      : 0
  if (count + 1 <= effective.memberLimit) return null
  return fail(
    'MEMBER_LIMIT_REACHED',
    `已达免费成员上限（${effective.memberLimit} 人），可到家庭页兑换内测加强版`
  )
}

function userProfile(user) {
  return {
    nickname: String((user && user.nickname) || '').trim(),
    avatarUrl: String((user && user.avatarUrl) || '').trim()
  }
}

async function loadUserProfiles(openids) {
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
      map[id] = userProfile(snap && snap.data)
    })
  )
  return map
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

async function seedStructureTree(familyId) {
  try {
    const existingSpaces = await db.collection('spaces').where({ familyId }).limit(10).get()
    if (!(existingSpaces.data || []).length) {
      const now = Date.now()
      await db.collection('spaces').add({
        data: {
          familyId,
          name: '仓库',
          floorId: null,
          isDefault: true,
          coverKey: 'default-indoor',
          createdAt: now,
          updatedAt: now
        }
      })
    }

    const famSnap = await db.collection('families').doc(familyId).get().catch(() => null)
    if (famSnap && famSnap.data && !famSnap.data.tagsSeededAt) {
      const existingTags = await db.collection('tags').where({ familyId }).limit(10).get()
      if (!(existingTags.data || []).length) {
        const now = Date.now()
        const names = ['药品', '饮料', '工具', '衣物']
        for (let i = 0; i < names.length; i++) {
          await db.collection('tags').add({
            data: {
              familyId,
              name: names[i],
              isDefault: true,
              createdAt: now + i,
              updatedAt: now + i
            }
          })
        }
      }
      await db.collection('families').doc(familyId).update({
        data: { tagsSeededAt: Date.now() }
      })
    }

    await rebuildFamilyTree(db, familyId)
  } catch (e) {
    console.warn('seedStructureTree failed', familyId, e && e.message)
  }
}

async function createFamily(openid, event) {
  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入家庭名称')

  await ensureUser(openid)
  await ensureCapacityCollections()

  const familyCapErr = await assertUserFamilyCapacity(openid)
  if (familyCapErr) return familyCapErr

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
      expireReminderEnabled: true,
      tagsSeededAt: null,
      itemCount: 0,
      entitlement: null,
      createdAt: now
    }
  })
  const familyId = addRes._id

  await db.collection('memberships').doc(membershipId(openid, familyId)).set({
    data: {
      openid,
      familyId,
      joinedAt: now,
      subscribeExpireGrantedAt: null
    }
  })

  await setCurrentFamily(openid, familyId)

  await seedStructureTree(familyId)

  return ok(
    await withCapacity(
      familyId,
      {
        name,
        inviteCode,
        ownerOpenid: openid,
        memberCount: 1,
        background,
        expireReminderEnabled: true,
        itemCount: 0,
        entitlement: null,
        createdAt: now
      },
      openid
    )
  )
}

async function joinFamily(openid, event) {
  const inviteCode = String(event.inviteCode || '')
    .trim()
    .toUpperCase()
  if (!inviteCode || inviteCode.length !== INVITE_LEN) {
    return fail('INVALID_CODE', '邀请码无效')
  }

  await ensureUser(openid)
  await ensureCapacityCollections()

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

  const familyCapErr = await assertUserFamilyCapacity(openid)
  if (familyCapErr) return familyCapErr

  const memberCapErr = await assertMemberCapacity(familyId, family)
  if (memberCapErr) return memberCapErr

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

  return ok(
    await withCapacity(
      familyId,
      {
        ...family,
        memberCount: (family.memberCount || 0) + 1
      },
      openid
    )
  )
}

async function getMyFamily(openid) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const mid = membershipId(openid, familyId)
  const [mem, fam, subSnap] = await Promise.all([
    db.collection('memberships').doc(mid).get().catch(() => null),
    db.collection('families').doc(familyId).get().catch(() => null),
    db.collection('familySubscriptions').doc(familyId).get().catch(() => null)
  ])
  if (!mem || !mem.data) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }
  if (!fam || !fam.data) {
    return fail('NO_FAMILY', '家庭不存在')
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
    ...familySummary(familyId, fam.data, openid),
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
    }
  }
  return ok({ ...family, profile: userProfile(user) })
}

async function listMembers(openid) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) return fail('NO_FAMILY', '尚未加入家庭')

  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) return fail('NO_FAMILY', '家庭不存在')

  const memRes = await db
    .collection('memberships')
    .where({ familyId })
    .limit(50)
    .get()
  const memberships = memRes.data || []
  const profiles = await loadUserProfiles(memberships.map((m) => m.openid))
  const ownerOpenid = fam.data.ownerOpenid
  const list = memberships
    .map((m) => {
      const profile = profiles[m.openid] || { nickname: '', avatarUrl: '' }
      return {
        openid: m.openid,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        isOwner: m.openid === ownerOpenid,
        isMe: m.openid === openid,
        joinedAt: m.joinedAt || 0
      }
    })
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1
      if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
      return (a.joinedAt || 0) - (b.joinedAt || 0)
    })

  return ok({ list, profile: userProfile(user) })
}

/**
 * 家庭页一次拉齐：我的家庭列表（含当前家容量）+ 成员。
 * 身份只解析一次，避免 listMyFamilies ∥ listMembers 重复读 users/families。
 */
async function pageBundle(openid) {
  const user = await ensureUser(openid)
  const currentFamilyId = user.currentFamilyId || null
  const selfProfile = userProfile(user)

  const memRes = await db.collection('memberships').where({ openid }).limit(20).get()
  const memberships = memRes.data || []
  if (!memberships.length) {
    return ok({
      currentFamilyId: null,
      family: null,
      list: [],
      members: [],
      profile: selfProfile
    })
  }

  const ids = memberships.map((m) => m.familyId)
  const [famRes, subSnap, memberMemRes] = await Promise.all([
    db
      .collection('families')
      .where({ _id: _.in(ids) })
      .limit(20)
      .get(),
    currentFamilyId
      ? db.collection('familySubscriptions').doc(currentFamilyId).get().catch(() => null)
      : Promise.resolve(null),
    currentFamilyId
      ? db.collection('memberships').where({ familyId: currentFamilyId }).limit(50).get()
      : Promise.resolve({ data: [] })
  ])

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
        isCurrent: m.familyId === currentFamilyId
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))

  let family = null
  if (currentFamilyId && byId[currentFamilyId]) {
    const famDoc = byId[currentFamilyId]
    const sub = subSnap && subSnap.data ? subSnap.data : null
    const now = Date.now()
    const effective = entitlements.resolveEffectiveFromSub(sub, now)
    let itemCount =
      famDoc.itemCount == null || !Number.isFinite(Number(famDoc.itemCount))
        ? null
        : Number(famDoc.itemCount)
    if (itemCount != null && itemCount < 0) itemCount = 0
    family = {
      ...familySummary(currentFamilyId, famDoc, openid),
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
      }
    }
  }

  const memberRows = (memberMemRes && memberMemRes.data) || []
  const otherIds = memberRows.map((m) => m.openid).filter((id) => id && id !== openid)
  const profiles = await loadUserProfiles(otherIds)
  profiles[openid] = selfProfile
  const ownerOpenid = family
    ? family.ownerOpenid
    : byId[currentFamilyId] && byId[currentFamilyId].ownerOpenid
  const members = memberRows
    .map((m) => {
      const profile = profiles[m.openid] || { nickname: '', avatarUrl: '' }
      return {
        openid: m.openid,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        isOwner: m.openid === ownerOpenid,
        isMe: m.openid === openid,
        joinedAt: m.joinedAt || 0
      }
    })
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1
      if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
      return (a.joinedAt || 0) - (b.joinedAt || 0)
    })

  return ok({
    currentFamilyId,
    family,
    list,
    members,
    profile: selfProfile
  })
}

async function updateProfile(openid, event) {
  await ensureUser(openid)
  const hasNickname = event && Object.prototype.hasOwnProperty.call(event, 'nickname')
  const hasAvatar = event && Object.prototype.hasOwnProperty.call(event, 'avatarFileID')
  if (!hasNickname && !hasAvatar) {
    return fail('INVALID_PROFILE', '没有可更新的资料')
  }

  const patch = { updatedAt: Date.now() }
  if (hasNickname) {
    const nickname = String(event.nickname || '').trim()
    if (nickname.length > 20) {
      return fail('INVALID_NICKNAME', '称呼最多 20 字')
    }
    patch.nickname = nickname
  }

  let oldAvatarUrl = ''
  if (hasAvatar) {
    const avatarFileID = String(event.avatarFileID || '').trim()
    if (avatarFileID && !avatarFileID.startsWith('cloud://')) {
      return fail('INVALID_AVATAR', '头像无效')
    }
    const prev = await db.collection('users').doc(openid).get().catch(() => null)
    oldAvatarUrl =
      prev && prev.data && prev.data.avatarUrl
        ? String(prev.data.avatarUrl).trim()
        : ''
    patch.avatarUrl = avatarFileID
  }

  await db.collection('users').doc(openid).update({ data: patch })

  if (oldAvatarUrl && oldAvatarUrl !== patch.avatarUrl) {
    try {
      await cloud.deleteFile({ fileList: [oldAvatarUrl] })
    } catch (e) {
      console.warn('avatar old file delete failed')
    }
  }

  const user = await ensureUser(openid)
  return ok(userProfile(user))
}

async function listMyFamilies(openid) {
  const user = await ensureUser(openid)
  const memRes = await db.collection('memberships').where({ openid }).limit(20).get()
  const memberships = memRes.data || []
  const currentFamilyId = user.currentFamilyId || null
  if (!memberships.length) {
    return ok({ currentFamilyId: null, family: null, list: [] })
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
        isCurrent: m.familyId === currentFamilyId
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))

  // 当前家庭附带容量字段，家庭页不必再单独打 getMyFamily
  let family = null
  if (currentFamilyId && byId[currentFamilyId]) {
    family = await withCapacity(currentFamilyId, byId[currentFamilyId], openid)
  }

  return ok({
    currentFamilyId,
    family,
    list,
    profile: userProfile(user)
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
  return ok(await withCapacity(familyId, fam.data, openid))
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

  const type = String(event.type || '').trim() || 'theme'
  const value = String(event.value || event.themeId || '').trim()
  if (type !== 'theme' || !THEME_IDS.includes(value)) {
    return fail('INVALID_BACKGROUND', '主题无效')
  }

  const famBefore = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!famBefore || !famBefore.data) {
    return fail('NO_FAMILY', '家庭不存在')
  }

  const background = { type: 'theme', value }
  await db.collection('families').doc(familyId).update({
    data: { background }
  })

  const fam = await db.collection('families').doc(familyId).get()
  return ok(familySummary(familyId, { ...fam.data, background }, openid))
}

async function updateName(openid, event) {
  const name = String(event.name || '').trim()
  if (!name) return fail('INVALID_NAME', '请输入家庭名称')
  if (name.length > 20) return fail('INVALID_NAME', '家庭名称过长')

  const user = await ensureUser(openid)
  const familyId = String(event.familyId || user.currentFamilyId || '').trim()
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const famBefore = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!famBefore || !famBefore.data) {
    return fail('NO_FAMILY', '家庭不存在')
  }

  await db.collection('families').doc(familyId).update({
    data: { name }
  })

  return ok(familySummary(familyId, { ...famBefore.data, name }, openid))
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

/** 解散家庭时清 AI 密钥；普通成员 leave 不要调用。 */
async function cleanupFamilyAiArtifacts(familyId) {
  try {
    await removeInBatches(db.collection('familyAiKeys'), { familyId })
  } catch (e) {
    console.warn('familyAiKeys dissolve cleanup failed', familyId, e && e.message)
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
    await removeInBatches(db.collection('tags'), { familyId })
    await removeInBatches(db.collection('activities'), { familyId })
    await removeInBatches(db.collection('itemExpireSubs'), { familyId }).catch(
      (e) => {
        console.warn('itemExpireSubs dissolve cleanup failed', familyId, e)
      }
    )
    await cleanupFamilyAiArtifacts(familyId)
    try {
      await db.collection('familySubscriptions').doc(familyId).remove()
    } catch (e) {
      console.warn('familySubscriptions dissolve cleanup failed', familyId, e && e.message)
    }
    await deleteFamilyTree(db, familyId)
    await removeInBatches(db.collection('memberships'), { familyId })
    await reassignUsersCurrentFamily(familyId)
    await db.collection('families').doc(familyId).remove()

    const nextFamilyId = await pickOtherFamilyId(openid, familyId)
    if (nextFamilyId) {
      await setCurrentFamily(openid, nextFamilyId)
    }
    return ok({ dissolved: true, nextFamilyId: nextFamilyId || null })
  }

  // 普通成员退出：家庭仍在
  await removeInBatches(db.collection('itemExpireSubs'), {
    familyId,
    openid
  }).catch((e) => {
    console.warn('itemExpireSubs leave cleanup failed', familyId, openid, e)
  })
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

async function updateExpireReminder(openid, event) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  const enabled = event.enabled === true || event.enabled === 1 || event.enabled === 'true'
  await db.collection('families').doc(familyId).update({
    data: { expireReminderEnabled: enabled }
  })

  const fam = await db.collection('families').doc(familyId).get()
  return ok(familySummary(familyId, fam.data, openid))
}

/**
 * 客户端在 requestSubscribeMessage 接受后调用，记录本家成员授权。
 */
async function recordSubscribeExpire(openid) {
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) {
    return fail('NO_FAMILY', '尚未加入家庭')
  }

  await db.collection('memberships').doc(mid).update({
    data: { subscribeExpireGrantedAt: Date.now() }
  })
  return ok({ granted: true })
}

async function getEntitlement(openid) {
  await ensureCapacityCollections()
  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) return fail('NO_FAMILY', '尚未加入家庭')

  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) return fail('NO_FAMILY', '家庭不存在')

  const cap = await loadCapacityFields(familyId, fam.data)
  const itemCount = cap.itemCount
  const itemLimit = cap.entitlement.itemLimit
  const memberCount =
    fam.data.memberCount == null || !Number.isFinite(Number(fam.data.memberCount))
      ? null
      : Number(fam.data.memberCount)
  const memberLimit = cap.entitlement.memberLimit
  return ok({
    planId: cap.entitlement.planId,
    active: cap.entitlement.active,
    expiresAt: cap.entitlement.expiresAt,
    itemLimit,
    memberLimit,
    familyLimit: cap.entitlement.familyLimit,
    activityLimit: cap.entitlement.activityLimit,
    itemCount,
    memberCount,
    remaining:
      itemLimit == null || itemCount == null
        ? null
        : Math.max(0, itemLimit - itemCount),
    memberRemaining:
      memberLimit == null || memberCount == null
        ? null
        : Math.max(0, memberLimit - memberCount),
    product: cap.entitlement.product
  })
}

async function redeem(openid, event) {
  await ensureCapacityCollections()
  const plain = entitlements.normalizeCode(event && event.code)
  if (!plain || plain.length < 8) {
    return fail('INVALID_CODE', '兑换码无效')
  }

  const user = await ensureUser(openid)
  const familyId = user.currentFamilyId
  if (!familyId) return fail('NO_FAMILY', '尚未加入家庭')

  const mid = membershipId(openid, familyId)
  const mem = await db.collection('memberships').doc(mid).get().catch(() => null)
  if (!mem || !mem.data) return fail('NO_FAMILY', '尚未加入家庭')

  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) return fail('NO_FAMILY', '家庭不存在')

  const codeHash = entitlements.hashCode(plain)
  const codeSnap = await db.collection('redeemCodes').doc(codeHash).get().catch(() => null)
  if (!codeSnap || !codeSnap.data) {
    return fail('INVALID_CODE', '兑换码无效')
  }
  const codeDoc = codeSnap.data
  if (codeDoc.status === 'revoked') {
    return fail('CODE_REVOKED', '兑换码已失效')
  }
  if (codeDoc.status === 'used') {
    return fail('CODE_USED', '兑换码已使用')
  }
  if (codeDoc.status !== 'unused') {
    return fail('INVALID_CODE', '兑换码无效')
  }

  const product = entitlements.getProduct(codeDoc.product)
  const days = Number(codeDoc.days) || (product && product.days) || 0
  const planId = codeDoc.planId || (product && product.planId) || 'capacity_std'
  if (!days || days < 1) {
    return fail('INVALID_CODE', '兑换码产品无效')
  }

  const now = Date.now()
  const claim = await db
    .collection('redeemCodes')
    .where({ _id: codeHash, status: 'unused' })
    .update({
      data: {
        status: 'used',
        usedByFamilyId: familyId,
        usedByOpenid: openid,
        usedAt: now
      }
    })
  if (!claim || !claim.stats || claim.stats.updated === 0) {
    return fail('CODE_USED', '兑换码已使用')
  }

  let existing = null
  try {
    const subSnap = await db.collection('familySubscriptions').doc(familyId).get()
    if (subSnap && subSnap.data) existing = subSnap.data
  } catch (e) {
    existing = null
  }

  const base = Math.max(
    existing && existing.expiresAt ? Number(existing.expiresAt) : 0,
    now
  )
  const expiresAt = base + days * 86400000
  const subDoc = {
    familyId,
    planId,
    product: codeDoc.product || (product && product.id) || '',
    source: 'redeem',
    expiresAt,
    limitsOverride: (existing && existing.limitsOverride) || null,
    lastRedeemCodeId: codeHash,
    updatedAt: now,
    createdAt: (existing && existing.createdAt) || now
  }

  await db.collection('familySubscriptions').doc(familyId).set({
    data: subDoc
  })

  const effective = entitlements.resolveEffectiveFromSub(subDoc, now)
  await writeFamilyEntitlementSnapshot(familyId, effective)

  const summary = await withCapacity(
    familyId,
    {
      ...fam.data,
      entitlement: {
        planId: effective.planId,
        expiresAt: effective.expiresAt,
        itemLimit: effective.itemLimit,
        memberLimit: effective.memberLimit,
        familyLimit: effective.familyLimit,
        activityLimit: effective.activityLimit
      }
    },
    openid
  )

  return ok({
    family: summary,
    entitlement: summary.entitlement,
    expiresAt,
    planId,
    days
  })
}

const DURATION_UNIT_DAYS = {
  day: 1,
  week: 7,
  month: 30,
  year: 365
}

function resolveIssueDays(event, productDays) {
  const rawAmount = event && event.durationAmount
  const rawUnit = event && event.durationUnit
  const hasAmount = rawAmount != null && String(rawAmount).trim() !== ''
  const hasUnit = rawUnit != null && String(rawUnit).trim() !== ''
  if (!hasAmount && !hasUnit) {
    const fallback = Number(productDays)
    if (!Number.isFinite(fallback) || fallback < 1) {
      return { error: fail('INVALID_DURATION', '无效时长') }
    }
    return { days: Math.floor(fallback) }
  }
  if (!hasAmount || !hasUnit) {
    return { error: fail('INVALID_DURATION', '请同时指定时长数量与单位') }
  }
  const amount = Number(rawAmount)
  const unit = String(rawUnit).trim()
  const factor = DURATION_UNIT_DAYS[unit]
  if (!factor || !Number.isFinite(amount) || amount < 1 || Math.floor(amount) !== amount) {
    return { error: fail('INVALID_DURATION', '时长无效') }
  }
  const days = Math.floor(amount) * factor
  if (days < 1 || days > 3650) {
    return { error: fail('INVALID_DURATION', '时长须在 1–3650 天') }
  }
  return { days }
}

async function issueCodes(openid, event) {
  await ensureCapacityCollections()
  const admin = String(process.env.ADMIN_OPENID || '').trim()
  if (!admin || openid !== admin) {
    return fail('FORBIDDEN', '无权发码')
  }

  const productId = String((event && event.product) || 'capacity_90d').trim()
  const product = entitlements.getProduct(productId)
  if (!product) {
    return fail('INVALID_PRODUCT', '未知产品')
  }

  const resolved = resolveIssueDays(event, product.days)
  if (resolved.error) return resolved.error
  const days = resolved.days

  let count = Number(event && event.count)
  if (!Number.isFinite(count) || count < 1) count = 1
  count = Math.min(50, Math.floor(count))
  const note = event && event.note != null ? String(event.note).slice(0, 200) : ''
  const now = Date.now()
  const codes = []

  for (let i = 0; i < count; i++) {
    let plain = ''
    let hash = ''
    let placed = false
    for (let attempt = 0; attempt < 8; attempt++) {
      plain = generatePlainCode()
      hash = entitlements.hashCode(plain)
      try {
        const existing = await db.collection('redeemCodes').doc(hash).get().catch(() => null)
        if (existing && existing.data) continue
        await db.collection('redeemCodes').doc(hash).set({
          data: {
            product: product.id,
            days,
            planId: product.planId,
            status: 'unused',
            usedByFamilyId: null,
            usedByOpenid: null,
            usedAt: null,
            createdAt: now,
            note
          }
        })
        placed = true
        break
      } catch (e) {
        // retry
      }
    }
    if (!placed) {
      return fail('INTERNAL', '发码失败，请重试')
    }
    codes.push(plain)
  }

  return ok({
    product: product.id,
    days,
    planId: product.planId,
    count: codes.length,
    codes
  })
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
      case 'listMembers':
        return await listMembers(OPENID)
      case 'page':
        return await pageBundle(OPENID)
      case 'updateProfile':
        return await updateProfile(OPENID, event || {})
      case 'switchFamily':
        return await switchFamily(OPENID, event)
      case 'updateBackground':
        return await updateBackground(OPENID, event)
      case 'updateName':
        return await updateName(OPENID, event)
      case 'updateExpireReminder':
        return await updateExpireReminder(OPENID, event)
      case 'recordSubscribeExpire':
        return await recordSubscribeExpire(OPENID)
      case 'getEntitlement':
        return await getEntitlement(OPENID)
      case 'redeem':
        return await redeem(OPENID, event)
      case 'issueCodes':
        return await issueCodes(OPENID, event)
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
