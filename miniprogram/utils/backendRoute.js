/**
 * 从 config/index.js 导出 Java API / 登录相关常量（兼容旧 require 路径）。
 * 改配置请改 config/index.js。
 */
const config = require('../config/index')

module.exports = {
  JAVA_BASE_URL: config.javaBaseUrl,
  AUTH_USE_MOCK_CODE: config.authUseMockCode,
  AUTH_MOCK_OPENID: config.authMockOpenid
}
