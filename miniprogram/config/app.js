/**
 * @deprecated 请改 `config/index.js`；本文件仅兼容旧 require。
 */
const config = require('./index')

module.exports = {
  appName: config.appName
}
