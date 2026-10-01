const javaApi = require('../../utils/javaApi')

/** 密钥页：走 Java `/api/ai/*`。 */
async function callAi(action, data = {}) {
  try {
    return await javaApi.callModule('ai', action, { ...data })
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
