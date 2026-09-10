const { ensureSession } = require('./session')
const { setAppFamily } = require('./theme')

/**
 * 启动分流：无家庭 → onboarding；有家庭 → items
 * @param {WechatMiniprogram.Page.Instance} page
 * @param {'onboarding' | 'items'} current
 */
async function routeByMembership(page, current) {
  page.setData({ bootLoading: true, bootError: '' })
  try {
    const session = await ensureSession()
    if (session.hasFamily) {
      setAppFamily(session.family)
      if (current !== 'items') {
        wx.reLaunch({ url: '/pages/items/index' })
        return session
      }
    } else {
      setAppFamily(null)
      if (current !== 'onboarding') {
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return session
      }
    }
    page.setData({ bootLoading: false })
    return session
  } catch (e) {
    page.setData({
      bootLoading: false,
      bootError: e.message || '加载失败，请重试'
    })
    throw e
  }
}

module.exports = {
  routeByMembership
}
