const javaApi = require('./javaApi')

/**
 * 家庭 AI 助手 / 密钥页 / 按图预填共用：走 Java `/api/ai/*`。
 * 不走主包 queryCache，也不接受客户端伪造 familyId。
 * 主包与各分包统一从这里引（分包可引主包文件，反之不行）。
 */
async function callAi(action, data = {}) {
  try {
    const timeout = action === 'act' ? 60000 : action === 'capture' ? 30000 : 20000
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
