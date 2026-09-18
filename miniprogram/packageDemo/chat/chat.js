// pages/chat/chat.js
Page({
  data: {
    messages: [],
    input: '',
    sending: false,
    scrollIntoView: ''
  },

  onLoad() {
    this.pushMsg(
      'assistant',
      '你好，我是物资助手。你可以问「家里还有牛奶吗」，或说「帮我记一下：买了 2 瓶牛奶，放冰箱冷藏，9 月 20 日过期」。'
    )
  },

  pushMsg(role, content) {
    const messages = this.data.messages.concat([{ role, content }])
    this.setData({ messages, scrollIntoView: 'msg-' + (messages.length - 1) })
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  async send() {
    const text = (this.data.input || '').trim()
    if (!text || this.data.sending) return
    if (!wx.cloud) {
      this.pushMsg('assistant', '云开发未启用，请先在开发者工具中开通云开发')
      return
    }
    this.setData({ input: '', sending: true })
    this.pushMsg('user', text)
    try {
      const res = await wx.cloud.callFunction({ name: 'chatProxy', data: { message: text } })
      const r = (res && res.result) || {}
      this.pushMsg('assistant', r.ok ? r.reply : '出错了：' + (r.error || '未知错误'))
    } catch (e) {
      this.pushMsg('assistant', '网络异常，请稍后再试')
    } finally {
      this.setData({ sending: false })
    }
  }
})
