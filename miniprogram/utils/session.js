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
  let res
  try {
    res = await wx.cloud.callFunction({
      name: 'family',
      data: { action: 'getMyFamily' }
    })
  } catch (e) {
    const err = new Error(friendlyCloudError(e))
    err.code = 'CLOUD_CALL_FAILED'
    err.cause = e
    throw err
  }
  const result = (res && res.result) || {}
  if (result.ok) {
    return {
      hasFamily: true,
      family: result.data,
      currentFamilyId: result.data._id
    }
  }
  if (result.code === 'NO_FAMILY') {
    return {
      hasFamily: false,
      family: null,
      currentFamilyId: null
    }
  }
  const err = new Error(result.message || '会话初始化失败')
  err.code = result.code || 'SESSION_ERROR'
  throw err
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
