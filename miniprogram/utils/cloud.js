const cache = require('./queryCache')
const { shanghaiTodayYmd } = require('./expireStatus')

function friendlyCloudError(e) {
  const msg = (e && (e.errMsg || e.message)) || ''
  if (
    msg.includes('FUNCTION_NOT_FOUND') ||
    msg.includes('-501000') ||
    msg.includes('FunctionName parameter could not be found')
  ) {
    return '找不到云函数 family。控制台若已部署，多半是云环境不一致：请到云开发「设置」复制环境 ID，填入 utils/cloudbase-env.js 的 envId 后重新编译'
  }
  return msg || '网络或云开发异常'
}

function unwrap(res) {
  const result = (res && res.result) || {}
  if (result.ok) return result.data
  const err = new Error(result.message || '请求失败')
  err.code = result.code || 'UNKNOWN'
  err.result = result
  throw err
}

/** 可缓存的读。未登记的 action 一律做出网写，成功后默认整表清空。 */
const READ_ACTIONS = {
  family: { getMyFamily: true, listMyFamilies: true, listMembers: true },
  item: { get: true, search: true, list: true, count: true, listExpiring: true, home: true },
  space: { list: true, listLocations: true, listItemsBySpace: true, listPockets: true },
  tag: { list: true, ensureDefaults: true },
  activity: { list: true }
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
  if (name === 'item' && isRead('item', action)) return true
  if (name === 'activity' && action === 'list') return true
  if (
    name === 'space' &&
    (action === 'listItemsBySpace' || action === 'listPockets')
  ) {
    return true
  }
  return false
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
  cache.dropNameAction('space', 'listItemsBySpace')
  cache.dropNameAction('space', 'listPockets')
  clearCursor()
}

function invalidateFamilyReads() {
  cache.dropByName('family')
}

function applyWriteInvalidation(name, action) {
  if (name === 'item' && (action === 'create' || action === 'createMany' || action === 'update' || action === 'remove' || action === 'removeMany' || action === 'merge')) {
    invalidateItemDomain()
    return
  }
  if (name === 'space') {
    cache.dropByName('space')
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

async function rawCall(name, payload) {
  try {
    const res = await wx.cloud.callFunction({
      name,
      data: payload
    })
    return unwrap(res)
  } catch (e) {
    if (e.code && e.result) throw e
    const err = new Error(friendlyCloudError(e))
    err.code = 'CLOUD_CALL_FAILED'
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
    if (isItemDomainRead(name, action)) {
      await revalidateItemDomainIfNeeded()
    }

    const familyId = currentFamilyId()
    const key = readCacheKey(name, action, data, familyId)
    if (key && cache.has(key)) {
      if (isItemDomainRead(name, action)) kickCursorSeed()
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
        ''
      if (fid) {
        cache.set(readCacheKey(name, action, data, fid), result)
      }
      return result
    })()

    if (key) cache.setInflight(key, run)
    try {
      const result = await run
      if (isItemDomainRead(name, action)) kickCursorSeed()
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

module.exports = {
  callFamily,
  callItem,
  callSpace,
  callTag,
  callActivity,
  friendlyCloudError,
  markAppHidden,
  markAppShown,
  invalidateItemDomain,
  invalidateFamilyReads
}
