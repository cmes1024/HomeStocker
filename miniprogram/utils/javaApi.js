/**
 * Java API 客户端（X-HS-Token）。
 * 注意：utils/api.js 是旧演示 RequestUrl，勿混用。
 *
 * 鉴权策略：本地有 token 则业务请求直接带出；AuthFilter + 401 重登兜底。
 * /api/auth/me 只在冷启动 / 回前台探活，不在每次 callModule 前打。
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
/** /me 探活单飞 */
let probeInflight = null
/** 曾经进过后台，下次 onShow 再探一次会话 */
let needsSessionProbe = false

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

/**
 * 有本地 token 时打 /me 校验；过期或假 mock 会话则重新 login。
 * 无 token 时直接 login。
 */
async function probeSessionOnce() {
  const token = getToken()
  if (!token) return loginOnce()
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
  return loginOnce()
}

/**
 * 冷启动 / 回前台：探活会话（会打 /me 或 login）。
 */
async function probeSession() {
  if (probeInflight) return probeInflight
  if (loginInflight) return loginInflight
  probeInflight = probeSessionOnce().finally(() => {
    probeInflight = null
  })
  return probeInflight
}

/**
 * 业务请求前：保证本地有 token。有则直接返回，不打 /me。
 * 无 token 时走 login（与 probe 共享 loginInflight）。
 */
async function ensureLogin() {
  if (getToken()) {
    return { token: getToken() }
  }
  if (probeInflight) return probeInflight
  return login()
}

function markAuthHidden() {
  needsSessionProbe = true
}

function markAuthShown() {
  if (!needsSessionProbe) return
  needsSessionProbe = false
  probeSession().catch((e) => {
    console.warn(
      '[javaAuth] resume probe failed',
      (e && e.code) || '',
      (e && e.message) || e
    )
  })
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

/**
 * 二进制 POST（图片上传）。path 含 query，如 /api/storage/upload?kind=item&ext=jpg
 * @param {string} path
 * @param {ArrayBuffer|ArrayBufferView} data
 * @param {{ contentType?: string, auth?: boolean, timeout?: number }} [options]
 */
async function uploadBinary(path, data, options = {}) {
  const needAuth = options.auth !== false
  if (needAuth) {
    await ensureLogin()
  }
  const run = () => {
    const header = {
      'content-type': options.contentType || 'application/octet-stream'
    }
    const usedToken = needAuth ? getToken() : ''
    if (needAuth && usedToken) header[HEADER_TOKEN] = usedToken
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${JAVA_BASE_URL}${path}`,
        method: 'POST',
        data,
        header,
        timeout: options.timeout || 60000,
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
  try {
    return await run()
  } catch (e) {
    if (needAuth && e && e.code === 'UNAUTHORIZED') {
      await login()
      return run()
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
  uploadBinary,
  login,
  logout,
  me,
  ensureLogin,
  probeSession,
  markAuthHidden,
  markAuthShown,
  callModule
}
