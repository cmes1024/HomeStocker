
module.exports = {
  getMenuButtonInfo: function () {
    const res = wx.getMenuButtonBoundingClientRect()
    return res;
  },
  onMenuButtonInfoChange: function(callback){
    wx.onMenuButtonBoundingClientRectWeightChange(callback)
  },
  offMenuButtonInfoChange: function(callback){
    wx.offMenuButtonBoundingClientRectWeightChange(callback)
  }
}