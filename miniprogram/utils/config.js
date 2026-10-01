/**
 * 旧演示站 API host（packageDemo / 历史 RequestUrl）。
 * 产品 Java 后端配置请改 config/index.js，不要改这里。
 */
const HTTPS_PROTOCOL = "https://";
const HOST = 'xcx.moquyun.com';
const STATICHOST = 'xcx.moquyun.com'

module.exports = {
  version: '1.0.0',
  getHosts: function (options) {
    let { env, hostType } = options;
    let hostObj = {
      apiHost: `${HTTPS_PROTOCOL}${HOST}`,
      staticHost: `${HTTPS_PROTOCOL}${STATICHOST}`,
      paymentHost: `${HTTPS_PROTOCOL}${HOST}`,
      cdnHost: `${HTTPS_PROTOCOL}${HOST}`,
      agreementHost: `${HTTPS_PROTOCOL}${HOST}`
    }
    return hostType ? hostObj[hostType] : hostObj
  },
  envMaps: new Map([
    ["prod", ""]
  ]),
  prefixs: new Map([
    ["base", "/base"]
  ]),
  urls: {}
}