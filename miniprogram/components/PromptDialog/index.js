const { getAppTheme } = require('../../utils/theme')

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    subtitle: {
      type: String,
      value: ''
    },
    subtitleEm: {
      type: String,
      value: ''
    },
    placeholder: {
      type: String,
      value: ''
    },
    value: {
      type: String,
      value: ''
    },
    maxlength: {
      type: Number,
      value: 20
    },
    error: {
      type: String,
      value: ''
    },
    cancelText: {
      type: String,
      value: '取消'
    },
    confirmText: {
      type: String,
      value: '保存'
    },
    confirmType: {
      type: String,
      value: 'done'
    },
    busy: {
      type: Boolean,
      value: false
    }
  },

  data: {
    cssVarStyle: ''
  },

  observers: {
    show(show) {
      if (show) this.syncTheme()
    }
  },

  lifetimes: {
    attached() {
      this.syncTheme()
    }
  },

  pageLifetimes: {
    show() {
      this.syncTheme()
    }
  },

  methods: {
    syncTheme() {
      try {
        const theme = getAppTheme()
        const cssVarStyle = (theme && theme.cssVarStyle) || ''
        if (cssVarStyle !== this.data.cssVarStyle) {
          this.setData({ cssVarStyle })
        }
      } catch (e) {
        // keep last theme
      }
    },

    onNoop() {},

    onMaskTap() {
      this.onCancel()
    },

    onCancel() {
      if (this.properties.busy) return
      this.triggerEvent('cancel')
    },

    onInput(e) {
      this.triggerEvent('input', {
        value: (e.detail && e.detail.value) || ''
      })
    },

    onConfirm() {
      if (this.properties.busy) return
      this.triggerEvent('confirm', {
        value: this.properties.value || ''
      })
    }
  }
})
