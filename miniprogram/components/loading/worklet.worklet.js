/**
 * Loading 动画 Worklet
 *
 * 使用 Worklet 在渲染线程中驱动两球环绕动画，
 * 替代原有的 CSS @keyframes 实现，释放主线程。
 *
 * 使用方式：
 *   在组件 JS 中 require 此模块，将导出函数传入 WXML 的 worklet: 绑定。
 *   示例 WXML：
 *     <view worklet:animation="{{ loadingAnim }}" />
 *
 * Worklet 限制：
 *   - 不能使用 setData、wx API 等主线程能力
 *   - 只能操作渲染线程上下文中的数据
 *   - 函数需以 'worklet' 指令开头
 */

/**
 * 初始化两球环绕动画配置
 * @param {Object} opts - { ballSize, offset, leftBallScales, rightBallScales }
 */
export function createConfig(opts) {
  'worklet'
  return {
    size: opts?.ballSize ?? 26,
    offset: opts?.offset ?? 36,
    leftSteps: opts?.leftBallScales ?? [1, 0.75, 1, 0.75],
    rightSteps: opts?.rightBallScales ?? [1, 0.75, 1, 0.75],
  }
}

/**
 * 动画运行时的驱动函数
 * 在渲染线程逐帧执行，直接操作视图属性
 */
export function ballAnimationFrame(config, progress) {
  'worklet'
  // progress: 0..1 对应一个动画周期
  const { offset, leftSteps, rightSteps } = config
  const t = progress * 4          // 映射到 0..4 的四个阶段
  const phase = Math.floor(t) % 4 // 0,1,2,3
  const p = t - Math.floor(t)     // 阶段内进度 0..1

  // 左球位置
  const leftX = -offset * (1 - p * (phase === 0 ? 1 : phase === 1 ? 0 : phase === 2 ? -1 : 0))
  const leftY = offset * (phase === 1 ? p : phase === 3 ? 1 - p : 0)

  // 右球位置
  const rightX = -leftX
  const rightY = offset * (phase === 1 ? 1 - p : phase === 3 ? p : 1)

  return {
    left: { x: leftX, y: leftY, scale: leftSteps[phase] },
    right: { x: rightX, y: rightY, scale: rightSteps[phase] },
  }
}
