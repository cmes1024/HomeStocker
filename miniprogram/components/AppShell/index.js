const { DEFAULT_THEME, getThemeColors } = require('../../utils/theme')

Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    title: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: false
    },
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
    },
    /** 空间封面等可选图片层；家庭氛围不再使用 */
    bgImage: {
      type: String,
      value: ''
    },
    lightHeader: {
      type: Boolean,
      value: false
    },
    centerTitle: {
      type: Boolean,
      value: false
    },
    flushBottom: {
      type: Boolean,
      value: false
    },
    plainBack: {
      type: Boolean,
      value: false
    },
    subtitle: {
      type: String,
      value: ''
    }
  },

  data: {
    headerHeight: 64,
    navContentTop: 20,
    navContentHeight: 32,
    navSideWidth: 88,
    subtitleExtra: 0,
    layerA: {
      primary: DEFAULT_THEME.primary,
      secondary: DEFAULT_THEME.secondary,
      shadow: DEFAULT_THEME.shadow,
      bgImage: '',
      lightHeader: false,
      opacity: 1
    },
    layerB: {
      primary: DEFAULT_THEME.primary,
      secondary: DEFAULT_THEME.secondary,
      shadow: DEFAULT_THEME.shadow,
      bgImage: '',
      lightHeader: false,
      opacity: 0
    },
    frontKey: 'A',
    ready: false,
    navLight: false
  },

  lifetimes: {
    attached() {
      this.initNavMetrics()
      this._fadeTimer = null
      this.bootstrapLayers()
    },
    detached() {
      if (this._fadeTimer) {
        clearTimeout(this._fadeTimer)
        this._fadeTimer = null
      }
    }
  },

  observers: {
    subtitle: function () {
      this.initNavMetrics()
    },
    'primary, secondary, shadow, bgImage, lightHeader': function () {
      if (!this.data.ready) {
        this.bootstrapLayers()
        return
      }
      this.crossfadeTo(this.currentThemePayload())
    }
  },

  methods: {
    initNavMetrics() {
      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const subtitleExtra = String(this.properties.subtitle || '').trim() ? 18 : 0
        this.setData({
          headerHeight: menu.top + menu.height + 8 + subtitleExtra,
          navContentTop: menu.top,
          navContentHeight: menu.height,
          navSideWidth: Math.max(windowInfo.windowWidth - menu.left, 88),
          subtitleExtra
        })
      } catch (e) {
        // keep defaults
      }
    },

    resolveColors() {
      const primary = String(this.properties.primary || '').trim()
      const secondary = String(this.properties.secondary || '').trim()
      const shadow = String(this.properties.shadow || '').trim()
      if (primary && secondary && shadow) {
        return { primary, secondary, shadow }
      }
      try {
        return getThemeColors()
      } catch (e) {
        return {
          primary: DEFAULT_THEME.primary,
          secondary: DEFAULT_THEME.secondary,
          shadow: DEFAULT_THEME.shadow
        }
      }
    },

    currentThemePayload() {
      const colors = this.resolveColors()
      return {
        primary: colors.primary,
        secondary: colors.secondary,
        shadow: colors.shadow,
        bgImage: this.properties.bgImage || '',
        lightHeader: !!this.properties.lightHeader
      }
    },

    bootstrapLayers() {
      const theme = this.currentThemePayload()
      this.setData({
        layerA: { ...theme, opacity: 1 },
        layerB: {
          primary: theme.primary,
          secondary: theme.secondary,
          shadow: theme.shadow,
          bgImage: '',
          lightHeader: false,
          opacity: 0
        },
        frontKey: 'A',
        navLight: theme.lightHeader,
        ready: true
      })
    },

    themeKey(theme) {
      return `${theme.primary}|${theme.secondary}|${theme.shadow}|${theme.bgImage || ''}|${
        theme.lightHeader ? 1 : 0
      }`
    },

    crossfadeTo(next) {
      const frontKey = this.data.frontKey
      const front = this.data[`layer${frontKey}`]
      if (this.themeKey(front) === this.themeKey(next)) {
        this.setData({ navLight: next.lightHeader })
        return
      }

      const backKey = frontKey === 'A' ? 'B' : 'A'
      if (this._fadeTimer) {
        clearTimeout(this._fadeTimer)
        this._fadeTimer = null
      }

      this.setData({
        [`layer${backKey}`]: {
          ...next,
          opacity: 0
        }
      })

      wx.nextTick(() => {
        this.setData({
          [`layer${backKey}.opacity`]: 1,
          [`layer${frontKey}.opacity`]: 0,
          frontKey: backKey,
          navLight: next.lightHeader
        })
        this._fadeTimer = setTimeout(() => {
          this._fadeTimer = null
        }, 480)
      })
    },

    onBack() {
      this.triggerEvent('back')
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
        return
      }
      wx.redirectTo({ url: '/pages/items/index' })
    }
  }
})
