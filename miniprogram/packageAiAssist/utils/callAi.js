const javaApi = require('../../utils/javaApi')

/**
 * 家庭管家：走 Java `/api/ai/*`。
 * 不走主包 queryCache，也不接受客户端伪造 familyId。
 */
async function callAi(action, data = {}) {
  try {
    const timeout = action === 'act' ? 60000 : 20000
    return await javaApi.callModule('ai', action, { ...data }, { timeout })
  } catch (e) {
    if (e && e.code) throw e
    const err = new Error((e && e.message) || 'Java AI 请求失败')
    err.code = 'JAVA_CALL_FAILED'
    err.cause = e
    throw err
  }
}

module.exports = {
  callAi
}
