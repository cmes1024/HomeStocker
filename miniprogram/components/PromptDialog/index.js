const { getAppTheme } = require('../../utils/theme')
const { chooseLocalImage, previewEntityImage } = require('../../utils/cloudImage')
const copy = require('../../utils/copy')

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
    },
    imageSrc: {
      type: String,
      value: ''
    },
    imageHint: {
      type: String,
      value: ''
    }
  },

  data: {
    cssVarStyle: '',
    imageReplace: copy.common.imageReplace
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
    },

    onPreviewImage() {
      if (this.properties.busy) return
      previewEntityImage(this.properties.imageSrc)
    },

    async onPickImage() {
      if (this.properties.busy) return
      try {
        const path = await chooseLocalImage()
        this.triggerEvent('imagechange', { path })
      } catch (e) {
        if (e && (e.errMsg || '').indexOf('cancel') >= 0) return
        if (e && e.code === 'NO_IMAGE') return
        wx.showToast({ title: '选图失败', icon: 'none' })
      }
    },

    onClearImage() {
      if (this.properties.busy) return
      this.triggerEvent('imageclear')
    }
  }
})
