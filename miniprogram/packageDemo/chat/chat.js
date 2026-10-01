// pages/chat/chat.js — 演示页；产品入口是 packageAiAssist
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
      '演示对话已退役。请从家庭页打开「家庭管家」。'
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
    this.setData({ input: '' })
    this.pushMsg('user', text)
    this.pushMsg('assistant', '演示对话已退役。请使用家庭管家。')
  }
})
