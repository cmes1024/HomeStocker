const { buildGradientValue, getThemeColors } = require('../../utils/theme')

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    /** 可选；不传则用 CSS 变量 / 全局当前主题 */
    primary: {
      type: String,
      value: ''
    },
    secondary: {
      type: String,
      value: ''
    },
    shadow: {
      type: String,
      value: ''
    }
  },

  data: {
    layerStyle: ''
  },

  observers: {
    'primary, secondary, shadow': function (primary, secondary, shadow) {
      this.refresh(primary, secondary, shadow)
    }
  },

  lifetimes: {
    attached() {
      this.refresh(
        this.properties.primary,
        this.properties.secondary,
        this.properties.shadow
      )
    }
  },

  methods: {
    refresh(primary, secondary, shadow) {
      const p = String(primary || '').trim()
      const s = String(secondary || '').trim()
      const sh = String(shadow || '').trim()
      if (p && s) {
        this.setData({
          layerStyle: `background: ${buildGradientValue(p, s, sh)};`
        })
        return
      }
      try {
        const colors = getThemeColors()
        this.setData({
          layerStyle: `background: ${buildGradientValue(
            colors.primary,
            colors.secondary,
            colors.shadow
          )};`
        })
      } catch (e) {
        this.setData({ layerStyle: '' })
      }
    }
  }
})
