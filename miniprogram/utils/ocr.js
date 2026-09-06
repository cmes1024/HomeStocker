function mock({ success, fail }) {

}
function start({ success, fail }) {
  wx.chooseImage({
    count: 1,
    success: async (res) => {
      try {
        const { data } = await wx.serviceMarket.invokeService({
          service: 'wx79ac3de8be320b71',
          api: 'OcrAllInOne',
          data: {
            img_url: new wx.serviceMarket.CDN({
              type: 'filePath',
              filePath: res.tempFilePaths[0],
            }),
            data_type: 3,
            ocr_type: 8
          },
        })
        success(selcetData(data.ocr_comm_res.items, res.tempFilePaths[0]))
      } catch (err) {
        fail(err)
      }
    },
    fail: err => {
      fail(err)
    }
  })
}

function selcetData(list) {
  let account = null;
  let password = null;
  list.map((item, index) => {
    let clearRes = clearOcrData(item.text)
    // 字符串最低6位起并且包含数字
    if (clearRes.length >= 6 && /\d/g.test(clearRes)) {
      isAccount(clearRes) && (account = {
        text: clearRes,
        confidence: item.confidence
      })
      isPassword(clearRes) && (password = {
        text: clearRes,
        confidence: item.confidence
      })
    }
  })
  return {
    account,
    password
  }
}

// 格式化ocr的数据
function clearOcrData(text) {
  const regex = /[^0-9a-zA-Z]/g
  return text.replace(regex, "");
}
// 判断是否符合卡号
function isAccount(text) {
  let targetLen = text.length;
  const [min, max] = [6, 10];
  return (targetLen > min && targetLen < max)
}
// 判断是否符合卡密
function isPassword(text) {
  let targetLen = text.length;
  const [min, max] = [14, 18];
  return (targetLen > min && targetLen < max)
}

module.exports = {
  mock,
  start
}