// components/Modal/index.js
Component({

  /**
   * 组件的属性列表
   */
  properties: {
    open: Boolean,
    zIndex: {
      type: Number,
      value: 1
    }
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    clickMask(){
      this.triggerEvent("clickoverlay");
    }
  }
})