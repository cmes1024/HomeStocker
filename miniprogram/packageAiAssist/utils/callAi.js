function unwrap(res) {
  const result = (res && res.result) || {}
  if (result.ok) return result.data
  const err = new Error(result.message || '请求失败')
  err.code = result.code || 'UNKNOWN'
  err.result = result
  throw err
}

function friendlyAiError(e) {
  const msg = (e && (e.errMsg || e.message)) || ''
  if (
    msg.includes('FUNCTION_NOT_FOUND') ||
    msg.includes('-501000') ||
    msg.includes('FunctionName parameter could not be found')
  ) {
    return '找不到云函数 ai。请先上传部署，并确认云环境一致'
  }
  if (
    msg.includes('-504003') ||
    msg.includes('TIME_LIMIT') ||
    msg.includes('timed out after')
  ) {
    return '助手这次没跑完，请再试一次。若反复出现，请把云函数 ai 超时设为 60 秒并确认已开通出网'
  }
  return msg || '网络或云开发异常'
}

/** 直打云函数 ai；不走主包 queryCache，也不接受客户端伪造 familyId。 */
async function callAi(action, data = {}) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'ai',
      data: { ...data, action }
    })
    return unwrap(res)
  } catch (e) {
    if (e.code && e.result) throw e
    const err = new Error(friendlyAiError(e))
    err.code = 'CLOUD_CALL_FAILED'
    err.cause = e
    throw err
  }
}

module.exports = {
  callAi
}
