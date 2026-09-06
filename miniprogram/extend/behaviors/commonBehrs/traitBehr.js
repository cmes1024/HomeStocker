/**
 * glass-easel 的 Behavior.trait 模式示例
 * 
 * 这是 glass-easel 组件框架提供的"接口契约"模式，用于组件间类型安全的通信。
 * 与 pageRouter 的动态注册不同，trait 在组件层级声明"我实现了什么能力"，
 * 其他组件可以通过 this.$('traits.xxx') 发现实现了特定 trait 的组件实例。
 * 
 * 使用方式：
 *   1. 组件在 behaviors 中包含 traitBehr 并实现 traitImpls
 *   2. 组件把自身的能力注册到 pageRouter，保留原有动态通信模式
 *   3. 其他组件可通过 traits 或 pageRouter 两种方式发现和调用
 * 
 * 示例：
 *   Component({
 *     behaviors: [require('xxx/traitBehr')],
 *     traitImpls: {
 *       'myNamespace/loadingControl': {
 *         show() { this.loading() },
 *         hide() { this.loaded() }
 *       }
 *     }
 *   })
 * 
 * 关联读取：
 *   // 在另一个组件中查找实现了 loadingControl trait 的实例
 *   const ctrl = this.$('traits.myNamespace/loadingControl')
 *   ctrl && ctrl.show()
 */

// 预定义一些业务中常用的 trait 名称常量
const TRAITS = {
  LOADING: 'pageRouter/loading',
  AGREEMENT: 'pageRouter/agreement',
  PRIVACY: 'pageRouter/privacy',
}

module.exports = Behavior({
  properties: {},
  data: {},
  methods: {
    getTraitNames() {
      return TRAITS
    },
    // 通过 trait 注册到 pageRouter（两层都支持）
    registerToRouter(methodMap) {
      if (!this.pageRouter) return
      Object.assign(this.pageRouter, methodMap)
    }
  },
  // 供 glass-easel 的 extraThisFieldsType 配置使用
  // 在 glass-easel 模式下，Behavior.trait 和 extraThisFieldsType
  // 可以提供类型安全的 this 字段访问
  lifetimes: {
    attached() {
      // 如果此行为被组件混入，且组件实现了 traitImpls，
      // glass-easel 会自动将 trait 注册到组件树中
      if (this.traitImpls) {
        console.debug(`[Trait] 组件已实现 trait:`, Object.keys(this.traitImpls))
      }
    }
  }
})
