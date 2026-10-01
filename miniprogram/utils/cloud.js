const cache = require('./queryCache')
const { shanghaiTodayYmd } = require('./expireStatus')
const javaApi = require('./javaApi')

/**
 * 领域 API 门面（读缓存 + 写失效）。
 * 底层一律 Java HTTP（utils/javaApi），与微信云开发无关。
 *
 * TTL：物资域 15s、结构/家庭域 45s（偏多人鲜度；跳页仍可短时命中）。
 */

/** 物资域读 TTL（item / activity.list / bootstrap / 含物资的 space 读） */
const TTL_ITEM_MS = 15 * 1000
/** 结构/家庭域读 TTL（family / space 结构 / tag） */
const TTL_STRUCT_MS = 45 * 1000

/** 可缓存的读。未登记的 action 一律做出网写，成功后默认整表清空。 */
const READ_ACTIONS = {
  family: { getMyFamily: true, listMyFamilies: true, listMembers: true, page: true },
  item: {
    get: true,
    detail: true,
    editForm: true,
    search: true,
    list: true,
    count: true,
    listExpiring: true,
    home: true
  },
  space: { list: true, listLocations: true, listItemsBySpace: true, listPockets: true, detail: true },
  tag: { list: true, ensureDefaults: true },
  activity: { list: true },
  bootstrap: { home: true }
}

function currentFamilyId() {
  try {
    const app = getApp()
    const g = app && app.globalData
    if (g && g.familyId) return String(g.familyId)
    if (g && g.family && g.family._id) return String(g.family._id)
  } catch (e) {
    // ignore
  }
  return ''
}

function isRead(name, action) {
  return !!(READ_ACTIONS[name] && READ_ACTIONS[name][action])
}

function isItemDomainRead(name, action) {
  if (name === 'bootstrap' && action === 'home') return true
  if (name === 'item' && isRead('item', action)) return true
  if (name === 'activity' && action === 'list') return true
  if (
    name === 'space' &&
    (action === 'listItemsBySpace' || action === 'listPockets' || action === 'detail')
  ) {
    return true
  }
  return false
}

function ttlFor(name, action) {
  if (isItemDomainRead(name, action)) return TTL_ITEM_MS
  return TTL_STRUCT_MS
}

function cacheSet(key, value, name, action) {
  if (!key) return
  cache.set(key, value, ttlFor(name, action))
}

function cacheAction(name, action) {
  if (name === 'tag' && action === 'ensureDefaults') return 'list'
  return action
}

function paramsForKey(data) {
  const out = {}
  const src = data || {}
  Object.keys(src)
    .sort()
    .forEach((k) => {
      if (k === 'action') return
      if (src[k] === undefined) return
      out[k] = src[k]
    })
  return out
}

function extraKey(name, action) {
  if (name === 'item' && (action === 'listExpiring' || action === 'home')) {
    return shanghaiTodayYmd()
  }
  if (name === 'bootstrap' && action === 'home') {
    return shanghaiTodayYmd()
  }
  return ''
}

let seenHide = false
let needsItemRevalidate = false
let lastCursor = null
let cursorInflight = null

function markAppHidden() {
  seenHide = true
}

function markAppShown() {
  if (seenHide) needsItemRevalidate = true
}

function rememberCursor(familyId, data) {
  lastCursor = {
    familyId,
    latestId: (data && data._id) || '',
    latestAt: Number((data && data.createdAt) || 0)
  }
}

function clearCursor() {
  lastCursor = null
}

function cursorMatches(familyId, data) {
  if (!lastCursor || lastCursor.familyId !== familyId) return false
  const id = (data && data._id) || ''
  const at = Number((data && data.createdAt) || 0)
  return lastCursor.latestId === id && lastCursor.latestAt === at
}

function invalidateItemDomain() {
  cache.dropByName('item')
  cache.dropByName('activity')
  cache.dropByName('bootstrap')
  cache.dropNameAction('space', 'listItemsBySpace')
  cache.dropNameAction('space', 'listPockets')
  cache.dropNameAction('space', 'detail')
  clearCursor()
}

function invalidateFamilyReads() {
  cache.dropByName('family')
  cache.dropByName('bootstrap')
}

function applyWriteInvalidation(name, action) {
  // 临期扫描可能消费订阅；轻量作废物资读缓存即可
  if (name === 'expireNotify') {
    cache.dropByName('item')
    return
  }
  if (name === 'item' && (action === 'create' || action === 'createMany' || action === 'update' || action === 'remove' || action === 'removeMany' || action === 'merge')) {
    invalidateItemDomain()
    return
  }
  if (name === 'space') {
    cache.dropByName('space')
    cache.dropByName('bootstrap')
    return
  }
  if (name === 'tag') {
    cache.dropByName('tag')
    return
  }
  if (name === 'family') {
    if (action === 'recordSubscribeExpire') return
    if (
      action === 'updateBackground' ||
      action === 'updateExpireReminder' ||
      action === 'redeem' ||
      action === 'updateName' ||
      action === 'updateProfile'
    ) {
      cache.dropByName('family')
      cache.dropByName('bootstrap')
      if (action === 'updateProfile' || action === 'redeem') {
        cache.dropByName('activity')
      }
      return
    }
    if (
      action === 'create' ||
      action === 'join' ||
      action === 'leave' ||
      action === 'switchFamily'
    ) {
      cache.clearAll()
      clearCursor()
      return
    }
  }
  cache.clearAll()
  clearCursor()
}

/**
 * 家庭页聚合成功后，分片写入 listMyFamilies / listMembers / getMyFamily 缓存。
 */
function seedFamilyPageBundle(bundle) {
  if (!bundle) return
  const fid =
    (bundle.family && bundle.family._id) ||
    bundle.currentFamilyId ||
    ''
  if (!fid) return

  cacheSet(cache.makeKey(fid, 'family', 'page', {}, ''), bundle, 'family', 'page')
  cacheSet(cache.makeKey(fid, 'family', 'listMyFamilies', {}, ''), {
    currentFamilyId: bundle.currentFamilyId,
    family: bundle.family,
    list: bundle.list || [],
    profile: bundle.profile || { nickname: '', avatarUrl: '' }
  }, 'family', 'listMyFamilies')
  cacheSet(cache.makeKey(fid, 'family', 'listMembers', {}, ''), {
    list: bundle.members || [],
    profile: bundle.profile || { nickname: '', avatarUrl: '' }
  }, 'family', 'listMembers')
  if (bundle.family && bundle.family._id) {
    cacheSet(
      cache.makeKey(fid, 'family', 'getMyFamily', {}, ''),
      {
        ...bundle.family,
        profile: bundle.profile || { nickname: '', avatarUrl: '' }
      },
      'family',
      'getMyFamily'
    )
  }
}

/**
 * 首页 bootstrap 成功后，把分片写入各域读缓存，其它页可直接命中。
 */
function seedBootstrapBundle(bundle, requestData) {
  if (!bundle || !bundle.family || !bundle.family._id) return
  const fid = String(bundle.family._id)
  const params = paramsForKey(requestData || {})

  cacheSet(
    cache.makeKey(fid, 'family', 'getMyFamily', {}, ''),
    bundle.family,
    'family',
    'getMyFamily'
  )
  if (bundle.spaces) {
    cacheSet(cache.makeKey(fid, 'space', 'list', {}, ''), bundle.spaces, 'space', 'list')
  }
  if (bundle.board) {
    const homeParams = {}
    if (params.limit !== undefined) homeParams.limit = params.limit
    if (params.spaceId) homeParams.spaceId = params.spaceId
    cacheSet(
      cache.makeKey(fid, 'item', 'home', homeParams, shanghaiTodayYmd()),
      bundle.board,
      'item',
      'home'
    )
  }
  if (bundle.cursor) {
    rememberCursor(fid, bundle.cursor)
  }
  cacheSet(
    cache.makeKey(fid, 'bootstrap', 'home', params, shanghaiTodayYmd()),
    bundle,
    'bootstrap',
    'home'
  )
}

async function rawCall(name, payload) {
  const action = payload && payload.action
  try {
    return await javaApi.callModule(name, action, payload || {})
  } catch (e) {
    if (e.code && e.result) throw e
    const err = new Error(e.message || 'Java API 调用失败')
    err.code = e.code || 'JAVA_CALL_FAILED'
    err.cause = e
    throw err
  }
}

function fetchCursor() {
  if (cursorInflight) return cursorInflight
  const pending = rawCall('activity', { action: 'cursor' }).finally(() => {
    if (cursorInflight === pending) cursorInflight = null
  })
  cursorInflight = pending
  return pending
}

function kickCursorSeed() {
  const familyId = currentFamilyId()
  if (!familyId || lastCursor || cursorInflight) return
  fetchCursor()
    .then((data) => {
      if (!lastCursor) rememberCursor(familyId, data)
    })
    .catch(() => {
      // 种子失败不挡读
    })
}

async function revalidateItemDomainIfNeeded() {
  if (!needsItemRevalidate) return
  const familyId = currentFamilyId()
  if (!familyId) {
    needsItemRevalidate = false
    return
  }
  try {
    const data = await fetchCursor()
    const had = !!(lastCursor && lastCursor.familyId === familyId)
    if (had && !cursorMatches(familyId, data)) invalidateItemDomain()
    rememberCursor(familyId, data)
  } catch (e) {
    // 失败开放：保缓存
  }
  needsItemRevalidate = false
}

function readCacheKey(name, action, data, familyId) {
  if (!familyId) return ''
  return cache.makeKey(
    familyId,
    name,
    cacheAction(name, action),
    paramsForKey(data),
    extraKey(name, action)
  )
}

async function invoke(name, data = {}) {
  const action = data.action
  if (name === 'activity' && action === 'cursor') {
    return fetchCursor()
  }

  if (isRead(name, action)) {
    const isBootstrapHome = name === 'bootstrap' && action === 'home'

    if (isBootstrapHome && needsItemRevalidate) {
      // bootstrap 自带 cursor，勿先打 activity.cursor（会重复 users/memberships/activities）
      needsItemRevalidate = false
      cache.dropByName('bootstrap')
      cache.dropByName('item')
      cache.dropByName('activity')
      cache.dropNameAction('space', 'listItemsBySpace')
      cache.dropNameAction('space', 'listPockets')
    } else if (isItemDomainRead(name, action)) {
      await revalidateItemDomainIfNeeded()
    }

    const familyId = currentFamilyId()
    const key = readCacheKey(name, action, data, familyId)
    if (key && cache.has(key)) {
      if (isItemDomainRead(name, action) && !isBootstrapHome) kickCursorSeed()
      return cache.get(key)
    }
    if (key) {
      const pending = cache.getInflight(key)
      if (pending) return pending
    }

    const run = (async () => {
      const result = await rawCall(name, data)
      const fid =
        familyId ||
        (name === 'family' && action === 'getMyFamily' && result && result._id) ||
        (isBootstrapHome && result && result.family && result.family._id) ||
        ''
      if (fid) {
        cacheSet(readCacheKey(name, action, data, fid), result, name, action)
      }
      if (isBootstrapHome && result) {
        seedBootstrapBundle(result, data)
      }
      if (name === 'family' && action === 'page' && result) {
        seedFamilyPageBundle(result)
      }
      return result
    })()

    if (key) cache.setInflight(key, run)
    try {
      const result = await run
      // bootstrap 已写入 cursor，不必再 kick activity.cursor
      if (isItemDomainRead(name, action) && !isBootstrapHome) kickCursorSeed()
      return result
    } finally {
      if (key) cache.clearInflight(key)
    }
  }

  const result = await rawCall(name, data)
  applyWriteInvalidation(name, action)
  return result
}

async function callFamily(action, data = {}) {
  return invoke('family', { ...data, action })
}

async function callItem(action, data = {}) {
  return invoke('item', { ...data, action })
}

async function callSpace(action, data = {}) {
  return invoke('space', { ...data, action })
}

async function callTag(action, data = {}) {
  return invoke('tag', { ...data, action })
}

async function callActivity(action, data = {}) {
  return invoke('activity', { ...data, action })
}

async function callBootstrap(action, data = {}) {
  return invoke('bootstrap', { ...data, action })
}

/** 手动触发临期订阅扫描。 */
async function callExpireNotify(action = 'run', data = {}) {
  return invoke('expireNotify', { ...data, action })
}

module.exports = {
  callFamily,
  callItem,
  callSpace,
  callTag,
  callActivity,
  callBootstrap,
  callExpireNotify,
  seedBootstrapBundle,
  seedFamilyPageBundle,
  markAppHidden,
  markAppShown,
  invalidateItemDomain,
  invalidateFamilyReads
}
