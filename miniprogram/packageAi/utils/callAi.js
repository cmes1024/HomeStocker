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
    return '识别超时。请在云开发控制台把云函数 ai 超时改成 60 秒'
  }
  if (msg.includes('fail internal') || msg.includes('openapi.serviceMarket')) {
    return '语音识别服务调用失败，请确认已开通一句话识别并重新上传云函数 ai'
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
