/**
 * 订阅消息模板：商品过期提醒（信息查询 / 模板编号 2201）
 * 与云函数 expireNotify 默认 tmplId 保持一致。
 */
const EXPIRE_SUBSCRIBE_TMPL_ID =
  '_oheW_DGsoqUxKsFIQrWSYIuoo4stYvsJv-JNf_uAiQ'

/**
 * 请求过期提醒订阅授权；拒绝不抛错。接受则 recordSubscribeExpire。
 */
async function requestExpireSubscribe(callFamily) {
  const tmplId = EXPIRE_SUBSCRIBE_TMPL_ID
  if (!tmplId) {
    return { skipped: true, reason: 'no_tmpl' }
  }
  try {
    const res = await new Promise((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: resolve,
        fail: reject
      })
    })
    const status = res && res[tmplId]
    if (status === 'accept') {
      if (typeof callFamily === 'function') {
        try {
          await callFamily('recordSubscribeExpire')
        } catch (e) {
          // 记录失败不阻断
        }
      }
      return { accepted: true }
    }
    return { accepted: false, status }
  } catch (e) {
    return { accepted: false, error: e && e.errMsg }
  }
}

module.exports = {
  EXPIRE_SUBSCRIBE_TMPL_ID,
  requestExpireSubscribe
}
