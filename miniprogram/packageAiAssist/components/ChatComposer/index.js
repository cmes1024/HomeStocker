const copy = require('../../../utils/copy')
const { getManager } = require('../../utils/speech')

Component({
  properties: {
    value: {
      type: String,
      value: ''
    },
    placeholder: {
      type: String,
      value: ''
    },
    loading: {
      type: Boolean,
      value: false
    },
    maxlength: {
      type: Number,
      value: 500
    },
    sendLabel: {
      type: String,
      value: '发送'
    },
    sendingLabel: {
      type: String,
      value: '…'
    }
  },

  data: {
    copy: copy.assist,
    voiceMode: false,
    recording: false,
    voiceCancel: false,
    voiceBars: [0, 1, 2, 3, 4, 5, 6],
    fieldOn: true,
    inputHeight: 36,
    keyboardOpen: false
  },

  lifetimes: {
    attached() {
      this.initMetrics()
      this._draft = ''
      this._seenValue = ''
      this.setData({ inputHeight: this._minH })
      this._onKeyboardHeight = (res) => {
        this.emitKeyboard(Math.max(0, Number((res && res.height) || 0)))
      }
      if (typeof wx.onKeyboardHeightChange === 'function') {
        wx.onKeyboardHeightChange(this._onKeyboardHeight)
      }
    },
    detached() {
      this.stopSpeech()
      this.unbindKeyboard()
    }
  },

  pageLifetimes: {
    hide() {
      this.stopSpeech()
      this.emitKeyboard(0)
    }
  },

  observers: {
    value(next) {
      const text = String(next || '')
      const fromInput = this._fromInput
      this._fromInput = false
      if (this._seenValue === undefined) {
        this._seenValue = text
        this._draft = text
        return
      }
      const prev = this._seenValue
      if (text === prev) return
      this._seenValue = text
      this._draft = text
      if (fromInput) return
      if (!text && prev) this.remountField()
    }
  },

  methods: {
    isDevtools() {
      if (this._devtools != null) return this._devtools
      let platform = ''
      try {
        const info =
          typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()
        platform = info && info.platform
      } catch (e) {
        platform = ''
      }
      this._devtools = platform === 'devtools'
      return this._devtools
    },

    initMetrics() {
      const win =
        typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const rpx = (Number(win.windowWidth) || 375) / 750
      this._padPx = Math.round(32 * rpx)
      this._linePx = Math.round(40 * rpx)
      this._maxLines = 5
      this._minH = this._padPx + this._linePx
    },

    remountField() {
      this.setData({ inputHeight: this._minH || this.data.inputHeight, fieldOn: false }, () => {
        this.setData({ fieldOn: true })
      })
    },

    emitKeyboard(height) {
      const next = Math.max(0, Number(height) || 0)
      if ((next > 0) !== this.data.keyboardOpen) {
        this.setData({ keyboardOpen: next > 0 })
      }
      this.triggerEvent('keyboardheight', { height: next })
    },

    unbindKeyboard() {
      if (this._onKeyboardHeight && typeof wx.offKeyboardHeightChange === 'function') {
        wx.offKeyboardHeightChange(this._onKeyboardHeight)
      }
      this._onKeyboardHeight = null
    },

    onTextInput(e) {
      const text = (e.detail && e.detail.value) || ''
      this._fromInput = true
      this._seenValue = text
      this._draft = text
      const patch = {}
      if (!String(text).trim()) {
        const minH = this._minH
        if (minH && this.data.inputHeight !== minH) patch.inputHeight = minH
      }
      if (Object.keys(patch).length) this.setData(patch)
      this.triggerEvent('input', { value: text })
    },

    onInputLineChange(e) {
      const lineCount = Math.max(1, Number((e && e.detail && e.detail.lineCount) || 1))
      const lines = Math.min(lineCount, this._maxLines || 5)
      const next = (this._padPx || 0) + (this._linePx || 20) * lines
      if (next === this.data.inputHeight) return
      this.setData({ inputHeight: next })
    },

    onKeyboardHeightChange(e) {
      this.emitKeyboard(Math.max(0, Number((e && e.detail && e.detail.height) || 0)))
    },

    onBlur() {
      this.emitKeyboard(0)
      this.triggerEvent('blur')
    },

    onConfirm(e) {
      const text = e && e.detail && typeof e.detail.value === 'string' ? e.detail.value : this._draft
      this.triggerEvent('send', { text, source: 'text' })
    },

    onSendTap() {
      if (this.data.loading) return
      this.triggerEvent('send', { text: this._draft || '', source: 'text' })
    },

    speechManager() {
      if (this._speech) return this._speech
      let manager
      try {
        manager = getManager()
      } catch (e) {
        return null
      }
      manager.onStart = () => {
        if (!this._holding) return
        this.setData({ recording: true, voiceCancel: false })
      }
      manager.onStop = (res) => {
        const intent = this._speechIntent
        this._speechActive = false
        this._speechIntent = ''
        this.setData({ recording: false, voiceCancel: false })
        if (intent !== 'send') return
        const said = String((res && res.result) || '').trim()
        if (!said) {
          wx.showToast({ title: copy.assist.voiceEmpty, icon: 'none' })
          return
        }
        this.triggerEvent('send', { text: said, source: 'voice' })
      }
      manager.onError = (res) => {
        const code = Number(res && res.retcode)
        if (code === -30011) return
        const intent = this._speechIntent
        this._speechActive = false
        this._holding = false
        this._speechIntent = ''
        this.setData({ recording: false, voiceCancel: false })
        if (code === -30012) return
        if (intent === 'send') {
          wx.showToast({ title: copy.assist.voiceFail, icon: 'none' })
        }
      }
      this._speech = manager
      return manager
    },

    stopSpeech() {
      this._holding = false
      this._speechIntent = 'cancel'
      if (!this._speech || !(this.data.recording || this._speechActive)) {
        if (this.data.recording || this.data.voiceCancel) {
          this.setData({ recording: false, voiceCancel: false })
        }
        return
      }
      try {
        this._speech.stop()
      } catch (e) {
        this._speechActive = false
        this.setData({ recording: false, voiceCancel: false })
      }
    },

    onToggleVoice() {
      if (this.data.loading || this.data.recording || this._speechActive) return
      const voiceMode = !this.data.voiceMode
      this.setData({ voiceMode, voiceCancel: false })
      if (!voiceMode) return
      if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard()
      this.speechManager()
      this.primeRecordAuth()
    },

    primeRecordAuth() {
      const authorize = () => {
        wx.authorize({ scope: 'scope.record', fail() {} })
      }
      if (typeof wx.requirePrivacyAuthorize === 'function') {
        wx.requirePrivacyAuthorize({ success: authorize, fail() {} })
        return
      }
      authorize()
    },

    onHoldStart(e) {
      if (this.data.loading || !this.data.voiceMode) return
      if (this._speechActive) {
        if (this.isDevtools()) this.finishHold()
        return
      }
      const touch = e.touches && e.touches[0]
      if (!touch) return
      const manager = this.speechManager()
      if (!manager) {
        wx.showToast({ title: copy.assist.voiceUnavailable, icon: 'none' })
        return
      }
      this._holding = true
      this._holdAt = Date.now()
      this._holdY = touch.clientY
      this._speechIntent = 'send'
      this._speechActive = true
      manager.start({ duration: 60000, lang: 'zh_CN' })
    },

    onHoldMove(e) {
      if (!this._holding) return
      const touch = e.touches && e.touches[0]
      if (!touch) return
      const cancel = this._holdY - touch.clientY > 70
      if (cancel === this.data.voiceCancel) {
        this._speechIntent = cancel ? 'cancel' : 'send'
        return
      }
      this._speechIntent = cancel ? 'cancel' : 'send'
      this.setData({ voiceCancel: cancel })
      if (cancel && typeof wx.vibrateShort === 'function' && !this.isDevtools()) {
        wx.vibrateShort({ type: 'light' })
      }
    },

    onHoldEnd() {
      const held = Date.now() - (this._holdAt || 0)
      // 模拟器一次点击会马上补一次 touchend。按住超过半秒的松手才算结束。
      if (this.isDevtools() && held < 280) return
      this.finishHold()
    },

    finishHold() {
      const started = !!(this.data.recording || this._speechActive)
      const held = Date.now() - (this._holdAt || Date.now())
      const tooShort = started && held < 500 && !this.data.voiceCancel
      this._holding = false
      this._speechIntent = this.data.voiceCancel || tooShort || !started ? 'cancel' : 'send'
      if (tooShort) wx.showToast({ title: copy.assist.voiceShort, icon: 'none' })
      if (!started) return
      this.setData({ recording: false, voiceCancel: false })
      try {
        this._speech.stop()
      } catch (e) {
        this._speechActive = false
      }
    },

    onHoldCancel() {
      // 开发者工具里鼠标按住时轻移会误报 touchcancel，不能当成松手。
    }
  }
})
