const pageBehavior = require("../behaviors/pageBehavior");
const { getMenuButtonInfo, onMenuButtonInfoChange, offMenuButtonInfoChange } = require("../functions/menuButton");
const { appName, share } = require("../../config/index");

const pageExtend = Page => {
  return object => {
    // 优先级!!!!!!
    // object > page > behaviors

    if(object.behaviors){
      object.behaviors.push(pageBehavior)
    }else {
      object.behaviors = [pageBehavior];
    }

    const menuPositionInfo = getMenuButtonInfo()
    object.data['menuPositionInfo'] = menuPositionInfo
    // 拆分为三个独立接口，避免一次拉取全部系统信息
    const windowInfo = wx.getWindowInfo?.() || {}
    const deviceInfo = wx.getDeviceInfo?.() || {}
    const systemSetting = wx.getSystemSetting?.() || {}
    object.data['windowInfo'] = windowInfo
    object.data['deviceInfo'] = deviceInfo
    object.data['systemSetting'] = systemSetting

    // 挂载登录结果函数到pageRouter上， 登录组件登录结果会触发改函数
    const pageReady = object?.onReady;
    object.onReady = function(){
      pageReady?.();
      this.pageRouter && object.loginResultPage && Object.assign(this.pageRouter, {
        loginResultPage: object.loginResultPage.bind(this)
      });
    }

    // 默认分享落到首页，避免带参落地页被二次转发时泄漏邀请码等 query
    if (!object.onShareAppMessage) {
      object.onShareAppMessage = function () {
        return {
          title: appName,
          path: share.path,
          imageUrl: share.imageUrl
        }
      }
    }

    return Page(object)
  }
}

const originPage = Page;

Page = pageExtend(originPage);