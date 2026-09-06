function getStorage(key) {
  if(!key) return;
  let data = wx.getStorageSync(key);
  try {
    return JSON.parse(data)
  } catch (error) {
    return data
  }
}
function setStorage(key, value){
  if(!key) return;
  let data = JSON.stringify(value);
  wx.setStorageSync(key, data)
}
module.exports = {
  getStorage,
  setStorage
}