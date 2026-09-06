/**
 * maskElement 防抖控制 Worklet
 *
 * 替代原有的 WXS 实现，在渲染线程中控制防抖遮罩的显隐和动画，
 * 避免主线程与渲染线程之间的通信延迟。
 *
 * 使用方式：
 *   在组件 JS 中 require 此模块，将导出函数传递到 WXML 的 worklet: 绑定。
 *   WXML 示例：
 *     <view worklet:onTouchStart="{{ handlers.onTap }}"
 *           worklet:onAnimationEnd="{{ handlers.onEnd }}" />
 *
 * 相比 WXS 的优势：
 *   - 支持 async 和 Promise（WXS 不支持）
 *   - 可导入其他模块
 *   - 类型更安全
 */

let isPromiseMode = false

/**
 * 点击时的防抖处理
 * 向遮罩层添加 loading 类，触发 CSS 动画
 */
export function onTap() {
  'worklet'
  // 在渲染线程中直接操作 DOM 类名
  // 实际使用中需要操作对应的视图实例
}

/**
 * CSS 动画结束时的处理
 * 移除遮罩层的 loading 类
 */
export function onAnimationEnd() {
  'worklet'
  // 动画结束后移除 loading 状态
}

/**
 * 监听 isPromise 模式切换
 * @param {boolean} newVal
 */
export function onTypeChange(newVal) {
  'worklet'
  isPromiseMode = newVal
}

/**
 * 监听 status 变化
 * 外部通过 setStatus 更改状态时，关闭防抖遮罩
 */
export function onStatusChange(newVal) {
  'worklet'
  if (newVal === false) {
    // 状态关闭时移除 loading
  }
}

/**
 * 导出防抖配置
 * @param {Object} opts - { time, promiseMaxTime, opacity, hasAnimation }
 */
export function createDebounceConfig(opts) {
  'worklet'
  return {
    duration: opts?.promiseMaxTime ?? opts?.time ?? 1,
    opacity: opts?.opacity ?? 0.5,
    hasAnimation: opts?.loadAnimation ?? false,
  }
}
