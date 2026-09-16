const { getThemeColors } = require('../../utils/theme')

/**
 * 无视觉节点：attached 时把当前主题上抛给父级。
 * 用法：<ThemeProvider bind:theme="onTheme" />
 */
Component({
  options: {
    virtualHost: true
  },

  lifetimes: {
    attached() {
      this.emitTheme()
    }
  },

  pageLifetimes: {
    show() {
      this.emitTheme()
    }
  },

  methods: {
    emitTheme() {
      try {
        this.triggerEvent('theme', getThemeColors())
      } catch (e) {
        // ignore
      }
    }
  }
})
