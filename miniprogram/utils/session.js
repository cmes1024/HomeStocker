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
 * 默认复用 globalData.family，避免 onboarding → 首页连打两次。
 * @param {{ force?: boolean }} [options]
 */
async function ensureSession(options = {}) {
  if (!options.force) {
    const cached = getCachedSession()
    if (cached) return cached
    if (inflight) return inflight
  }
  const pending = fetchSession().finally(() => {
    if (inflight === pending) inflight = null
  })
  inflight = pending
  return pending
}

module.exports = {
  ensureSession,
  getCachedSession,
  friendlyCloudError
}
