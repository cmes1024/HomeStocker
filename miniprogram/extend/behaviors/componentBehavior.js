const formBehr = require("./commonBehrs/formBehr");
const compExpBrhr = require("./commonBehrs/compExpBehr");
const traitBehr = require("./commonBehrs/traitBehr");

module.exports = Behavior({
  behaviors: [
    formBehr,
    compExpBrhr,
    traitBehr
  ],
  properties: {},
  data: {},
  methods: {
    // 组件通过此方法将能力注册到所在的 pageRouter
    // 业务组件在 ready 中调用：
    //   this.registerToRouter({ myMethod: this.myMethod.bind(this) })
    registerToRouter(methods) {
      if (this.pageRouter) {
        Object.assign(this.pageRouter, methods)
      }
    }
  }
})
