const mobilePattern =/^1[3-9]\d{9}$/
const emojisPattern=/[^\u0020-\u007E\u00A0-\u00BE\u2E80-\uA4CF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u0080-\u009F\u2000-\u201f\u2026\u2022\u20ac\r\n]/g

const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 手机号校验
function mobileVerify(str) {
  if (!str) return false
  return mobilePattern.test(str)
}
// emoji表情校验
function emojisVerify(str = '', options = {displayToast: false, isReplace: false}) {
  const {displayToast = false, isReplace = true} = options
  if (!str) {
    return {hasEmojis: false, val: ''}
  }
  let hasEmojis = emojisPattern.test(str)
  // 展示弹框
  if (displayToast && hasEmojis) {
    wx.showToast({
      title: '不能输入表情！',
      icon: 'none',
      duration: 1500
    })
  }
  // 是否替换
  if (isReplace && hasEmojis) {
    str = str.replace(emojisPattern, '')
  }
  return {
    hasEmojis,
    val: str
  }
}
// 解析小程序不限量太阳码中的参数
function getParamsFormWxacode(options) {
  if (options.scene) {
    try {
      let list = decodeURIComponent(options.scene);
      let pa = list.split("&") || [];
      let obj = {}
      pa.map(item => {
        if (item.indexOf("=") >= 0) {
          let temp = item.split("=");
          if (!obj[temp[0]]) {
            obj[temp[0]] = temp[1]
          }
        }
      })
      options.scene = obj
    } catch (err) { }
  }
  return options;
}
module.exports = {
  formatTime,
  mobileVerify,
  emojisVerify,
  getParamsFormWxacode
}
