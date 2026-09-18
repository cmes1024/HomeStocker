const { callFamily, friendlyCloudError } = require('./cloud')

/**
 * 读 App 全局家庭缓存。onboarding / 切家 / 离家会写 globalData.family。
 */
function getCachedSession() {
  try {
    const app = getApp()
    const family = app && app.globalData && app.globalData.family
    if (family && family._id) {
      return {
        hasFamily: true,
        family,
        currentFamilyId: family._id
      }
    }
  } catch (e) {
    // ignore
  }
  return null
}

let inflight = null
/** 含无家庭结果，避免冷启动 items→onboarding 连打两次 getMyFamily */
let memorySession = null

function rememberSession(session) {
  memorySession = session || null
}

function peekSessionMemory() {
  return memorySession
}

function clearSessionMemory() {
  memorySession = null
  inflight = null
}

async function fetchSession() {
  try {
    const family = await callFamily('getMyFamily')
    return {
      hasFamily: true,
      family,
      currentFamilyId: family._id
    }
  } catch (e) {
    if (e.code === 'NO_FAMILY') {
      return {
        hasFamily: false,
        family: null,
        currentFamilyId: null
      }
    }
    throw e
  }
}

/**
 * 会话：通过 family.getMyFamily 确保 users 存在，并判断是否已有家庭。
 * 默认复用 globalData.family / 进程内上次结果，避免首屏连打两次。
 * @param {{ force?: boolean }} [options]
 */
async function ensureSession(options = {}) {
  if (!options.force) {
    const cached = getCachedSession()
    if (cached) {
      memorySession = cached
      return cached
    }
    if (memorySession) return memorySession
    if (inflight) return inflight
  } else {
    memorySession = null
  }
  const pending = fetchSession()
    .then((session) => {
      memorySession = session
      return session
    })
    .finally(() => {
      if (inflight === pending) inflight = null
    })
  inflight = pending
  return pending
}

module.exports = {
  ensureSession,
  getCachedSession,
  rememberSession,
  peekSessionMemory,
  clearSessionMemory,
  friendlyCloudError
}
