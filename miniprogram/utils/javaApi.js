/**
 * Java API 客户端（X-HS-Token）。
 * 注意：utils/api.js 是旧演示 RequestUrl，勿混用。
 */
const {
  JAVA_BASE_URL,
  AUTH_USE_MOCK_CODE,
  AUTH_MOCK_OPENID
} = require('./backendRoute')

const TOKEN_KEY = 'hs_token'
const HEADER_TOKEN = 'X-HS-Token'

/** 登录单飞：避免并发 wx.login / code2session 把 code 用废 */
let loginInflight = null

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || ''
  } catch (e) {
    return ''
  }
}

function setToken(token) {
  try {
    if (token) wx.setStorageSync(TOKEN_KEY, token)
    else wx.removeStorageSync(TOKEN_KEY)
  } catch (e) {
    // ignore
  }
}

function clearToken() {
  setToken('')
}

function unwrap(body, statusCode, usedToken) {
  if (statusCode === 401) {
    // 只清「这次失败用的」token，避免并发新登录刚 set 就被旧 401 冲掉
    if (usedToken && getToken() === usedToken) clearToken()
    const err = new Error(
      (body && body.error && body.error.message) ||
        (body && body.message) ||
        '未登录'
    )
    err.code = 'UNAUTHORIZED'
    err.result = body
    throw err
  }
  if (body && body.ok) return body.data
  const code =
    (body && body.error && body.error.code) ||
    (body && body.code) ||
    'UNKNOWN'
  const message =
    (body && body.error && body.error.message) ||
    (body && body.message) ||
    '请求失败'
  const err = new Error(message)
  err.code = code
  err.result = body
  throw err
}

function request(method, path, data, options = {}) {
  const needAuth = options.auth !== false
  const header = {
    'content-type': 'application/json'
  }
  const usedToken = needAuth ? getToken() : ''
  if (needAuth && usedToken) header[HEADER_TOKEN] = usedToken
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${JAVA_BASE_URL}${path}`,
      method: method || 'POST',
      data: data || {},
      header,
      timeout: options.timeout || 20000,
      success(res) {
        try {
          resolve(unwrap(res.data, res.statusCode, usedToken))
        } catch (e) {
          reject(e)
        }
      },
      fail(e) {
        const err = new Error(
          (e && (e.errMsg || e.message)) || '网络异常（请确认 Java API 已启动）'
        )
        err.code = 'JAVA_CALL_FAILED'
        err.cause = e
        reject(err)
      }
    })
  })
}

async function resolveLoginCode() {
  if (AUTH_USE_MOCK_CODE) {
    return AUTH_MOCK_OPENID
  }
  const loginRes = await new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    })
  })
  if (!loginRes || !loginRes.code) {
    const err = new Error('wx.login 未返回 code')
    err.code = 'WX_LOGIN_FAILED'
    throw err
  }
  return loginRes.code
}

async function loginOnce() {
  const code = await resolveLoginCode()
  const data = await request('POST', '/api/auth/login', { code }, { auth: false })
  if (data && data.token) setToken(data.token)
  return data
}

async function login() {
  if (loginInflight) return loginInflight
  loginInflight = loginOnce().finally(() => {
    loginInflight = null
  })
  return loginInflight
}

async function logout() {
  try {
    if (getToken()) await request('POST', '/api/auth/logout', {})
  } finally {
    clearToken()
  }
}

async function me() {
  return request('POST', '/api/auth/me', {})
}

function sessionOpenid(data) {
  return (data && data.user && data.user.openid) || (data && data.openid) || ''
}

async function ensureLoginOnce() {
  const token = getToken()
  if (token) {
    try {
      const data = await me()
      const openid = sessionOpenid(data)
      if (
        !AUTH_USE_MOCK_CODE &&
        openid &&
        AUTH_MOCK_OPENID &&
        openid === AUTH_MOCK_OPENID
      ) {
        console.warn('[javaAuth] stale mock session, re-login with wx.login')
        clearToken()
        return loginOnce()
      }
      return data
    } catch (e) {
      if (e.code !== 'UNAUTHORIZED' && e.code !== 'JAVA_CALL_FAILED') {
        console.warn('[javaAuth] me failed, retry login', e.code || e.message)
      }
    }
  }
  return loginOnce()
}

/**
 * 冷启动 / 业务请求前：保证有有效会话。
 * mock 已关时若会话仍是假 openid（旧缓存），清 token 后强制 wx.login。
 */
async function ensureLogin() {
  if (loginInflight) return loginInflight
  loginInflight = ensureLoginOnce().finally(() => {
    loginInflight = null
  })
  return loginInflight
}

/** POST /api/{module}/{action}，body 对齐云函数 event（含其余字段，不含 action）。 */
async function callModule(module, action, data = {}, options = {}) {
  const body = { ...data }
  delete body.action
  const needAuth = options.auth !== false
  if (needAuth) {
    await ensureLogin()
  }
  const path =
    module === 'expireNotify' && (action === 'run' || action === 'main' || !action)
      ? '/api/notify/expire/run'
      : `/api/${module}/${action}`
  try {
    return await request('POST', path, body, options)
  } catch (e) {
    if (needAuth && e && e.code === 'UNAUTHORIZED') {
      await login()
      return request('POST', path, body, options)
    }
    throw e
  }
}

module.exports = {
  TOKEN_KEY,
  getToken,
  setToken,
  clearToken,
  request,
  login,
  logout,
  me,
  ensureLogin,
  callModule
}
