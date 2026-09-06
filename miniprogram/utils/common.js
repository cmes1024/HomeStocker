/**
 * 对网络异常状态做文案统一处理
 * @param {String} txt 异常文案
 */
function netWorkStatus(txt) { //判断用户网络情况
  const errors = [ //网络异常，切换网络等等原因
    "time out",
    "timeout",
    "ERR_TIMED_OUT",
    "ERR_CONNECTION_TIMED_OUT",
    "ERR_CONNECTION_ABORTED",
    "请求超时",
    "interrupted",
    "Network Error",
    "network interrupted error",
    "ERR_NAME_NOT_RESOLVED"
  ]
  const proxy = ["ERR_PROXY_CONNECTION_FAILED"]; //用户使用了代理
  const certificate = ["ERR_CERT_AUTHORITY_INVALID"]; //证书问题
  [...errors, ...proxy, ...certificate].map(item => {
    if (txt.indexOf(item) >= 0) {
      txt = "网络开小差啦～";
      return;
    }
  })
  return txt;
}

/**
 * 接口错误信息提示
 * @param {Object} error 异常信息
 * @param {Boolean} error.ignore 跳过提示
 * @param {String} error.errMsg 异常文案
 * @param {Number} duration toast提示时长
 */
function ErrorTip(error, duration = 2000) {
  if (error?.ignore || error.errorCode == 99) { // 忽略标识
    return;
  }
  try {
    if (error && error.status && error.status == 404) {
      return
    }
    const mes = netWorkStatus(error.message || error.msg || error.errMsg || '') || '网络开小差啦～';
    if (mes.indexOf('未登录') >= 0) {
      return;
    }
    wx.showToast({
      title: mes,
      icon: 'none',
      duration: duration
    })
  } catch (err) {
  }
}

module.exports = {
  ErrorTip
}