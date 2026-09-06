const componentBehavior = require("../behaviors/componentBehavior");
const { getMenuButtonInfo, onMenuButtonInfoChange, offMenuButtonInfoChange } = require("../functions/menuButton");
const componentExtend = Component => {
  return object => {

    // 优先级!!!!!!
    // object > page > behaviors
    if(object.behaviors){
      object.behaviors.push(componentBehavior)
    }else {
      object.behaviors = [componentBehavior];
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
    const componentsReady = object?.ready;
    object.ready = function(){
      componentsReady?.();
      this.pageRouter && object?.methods?.loginResultComponent && Object.assign(this.pageRouter, {
        loginResultComponent: object?.methods?.loginResultComponent.bind(this)
      });
    }

    return Component(object)
  }
}

const originComponent = Component;

Component = componentExtend(originComponent);