// 云函数：chatProxy
// 作用：中转 AI 对话请求 —— 从微信上下文拿 openId（注入 userId），转发给 Agent 服务，返回回复。
// 部署：需在微信开发者工具中上传部署，并在云函数环境变量配置 AGENT_URL（Agent 服务地址）。
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// Agent 服务地址（FastAPI，路径 A：云函数中转）。生产环境应配成可被云函数访问的 HTTPS 地址。
const AGENT_URL = process.env.AGENT_URL || 'http://127.0.0.1:8000'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const message = (event && event.message) || ''
  if (!message) {
    return { ok: false, error: '缺少 message' }
  }
  try {
    const { data } = await axios.post(
      `${AGENT_URL}/chat`,
      { user_id: OPENID, message },
      { timeout: 15000 }
    )
    return { ok: true, ...data }
  } catch (e) {
    const msg = e.response
      ? `${e.response.status} ${JSON.stringify(e.response.data)}`
      : (e.message || String(e))
    return { ok: false, error: msg }
  }
}
