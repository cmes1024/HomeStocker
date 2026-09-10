const { friendlyCloudError } = require('./session')

function unwrap(res) {
  const result = (res && res.result) || {}
  if (result.ok) return result.data
  const err = new Error(result.message || '请求失败')
  err.code = result.code || 'UNKNOWN'
  err.result = result
  throw err
}

async function callFamily(action, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'family',
      data: { ...data, action }
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

async function callItem(action, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'item',
      data: { ...data, action }
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

module.exports = {
  callFamily,
  callItem
}
