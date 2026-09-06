/**
 * 引用computer behavior的地方要有computed对象，否则不生效
 */
const computedBehavior = require("miniprogram-computed").behavior;
module.exports = Behavior({
  behaviors: [
    computedBehavior
  ]
})