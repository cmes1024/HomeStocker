/**
 * 小程序运行时配置（单一入口）。
 *
 * 改 API 地址、产品名、登录方式 → 只改本文件。
 * AppSecret 不在小程序：写在 server/.env（WECHAT_APP_ID / WECHAT_APP_SECRET）。
 *
 * 注意：project.config.json 的 appid、app.json 的 navigationBarTitleText
 * 无法 require 本文件，改完后请人工保持与下方 appId / appName 一致。
 */
module.exports = {
  /** 产品名（导航栏 / 分享 / 首页标题） */
  appName: '物资仓库',

  /** 与 project.config.json → appid 保持一致 */
  appId: 'wxb540e86bda9179c5',

  /** 默认分享 */
  share: {
    path: '/pages/items/index',
    imageUrl: '/assets/shared.png'
  },

  /**
   * Java API Base（模拟器 127.0.0.1；真机改成电脑局域网 IP，如 http://192.168.1.8:8080）
   */
  javaBaseUrl: 'https://hs.zfqwjs.com', // 'http://192.168.0.106:8080',

  /**
   * false：真实 wx.login → 服务端 code2session（须配 server/.env 的 APP_ID/SECRET）
   * true：仅应急本地联调，login 用稳定假 openid（默认勿开）
   */
  authUseMockCode: false,
  authMockOpenid: 'local-dev-openid'
}
