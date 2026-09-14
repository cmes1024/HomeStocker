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
    bgStyle: {
      type: String,
      value: ''
    },
    bgImage: {
      type: String,
      value: ''
    },
    lightHeader: {
      type: Boolean,
      value: false
    },
    themeColor: {
      type: String,
      value: '#3F7A88'
    },
    centerTitle: {
      type: Boolean,
      value: false
    },
    flushBottom: {
      type: Boolean,
      value: false
    }
  },

  data: {
    headerHeight: 64,
    navContentTop: 20,
    navContentHeight: 32,
    navSideWidth: 88,
    layerA: {
      bgStyle: '',
      bgImage: '',
      lightHeader: false,
      opacity: 1
    },
    layerB: {
      bgStyle: '',
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
    'bgStyle, bgImage, lightHeader': function (bgStyle, bgImage, lightHeader) {
      if (!this.data.ready) {
        this.bootstrapLayers()
        return
      }
      this.crossfadeTo({
        bgStyle: bgStyle || '',
        bgImage: bgImage || '',
        lightHeader: !!lightHeader
      })
    }
  },

  methods: {
    initNavMetrics() {
      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        this.setData({
          headerHeight: menu.top + menu.height + 8,
          navContentTop: menu.top,
          navContentHeight: menu.height,
          navSideWidth: Math.max(windowInfo.windowWidth - menu.left, 88)
        })
      } catch (e) {
        // keep defaults
      }
    },

    currentThemePayload() {
      return {
        bgStyle: this.properties.bgStyle || '',
        bgImage: this.properties.bgImage || '',
        lightHeader: !!this.properties.lightHeader
      }
    },

    bootstrapLayers() {
      const theme = this.currentThemePayload()
      this.setData({
        layerA: { ...theme, opacity: 1 },
        layerB: { bgStyle: '', bgImage: '', lightHeader: false, opacity: 0 },
        frontKey: 'A',
        navLight: theme.lightHeader,
        ready: true
      })
    },

    themeKey(theme) {
      return `${theme.bgStyle}||${theme.bgImage}||${theme.lightHeader ? 1 : 0}`
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

      // 先铺好下一层（透明），再淡入/淡出
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
