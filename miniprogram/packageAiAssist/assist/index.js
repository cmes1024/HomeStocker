const { callAi } = require('../utils/callAi')
const {
  HISTORY_LIMIT,
  loadTurns,
  saveTurns,
  clearTurns,
  turnsToMessages,
  historyFromMessages,
  extractTurns
} = require('../utils/transcript')
const { ensureSession } = require('../../utils/session')
const { bindThemeToPage, setAppFamily } = require('../../utils/theme')
const { callItem, callFamily, invalidateItemDomain } = require('../../utils/cloud')
const { requestExpireSubscribe } = require('../../utils/subscribeExpire')
const copy = require('../../utils/copy')

function decodeOpt(value) {
  if (value == null || value === '') return ''
  try {
    return decodeURIComponent(String(value))
  } catch (e) {
    return String(value)
  }
}

/** 确认卡展示名与稳定 key；WXML 不能安全调用 Array.join，合并项也没有 ref */
function normalizeConfirmList(raw) {
  return (raw || []).map((row, index) => {
    const names = Array.isArray(row && row.names)
      ? row.names.map((n) => String(n || '').trim()).filter(Boolean)
      : []
    const displayName =
      names.length > 0
        ? names.join('、')
        : String((row && row.name) || '').trim() || '物资'
    const key =
      String((row && row.ref) || '') ||
      (Array.isArray(row && row.refs) && row.refs.length
        ? row.refs.join('-')
        : '') ||
      String((row && row.itemId) || '') ||
      `c${index}`
    return { ...row, displayName, key }
  })
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cleanDraft(draft) {
  if (!draft || typeof draft !== 'object') return null
  return {
    name: String(draft.name || '').trim(),
    quantity: draft.quantity != null && draft.quantity !== '' ? draft.quantity : '',
    unit: String(draft.unit || '').trim(),
    note: String(draft.note || '').trim(),
    spaceName: String(draft.spaceName || '').trim(),
    locationName: String(draft.locationName || '').trim(),
    expireDate: draft.expireDate || '',
    productionDate: draft.productionDate || ''
  }
}

/** 气泡文案：lead + 卡片标题/副标题，保证 history 能看见数量前后 */
function buildResultText(lead, blocks, lines, wrote) {
  const cardLines = []
  asArray(blocks).forEach((block) => {
    asArray(block && block.cards).forEach((card) => {
      const title = String((card && card.title) || '').trim()
      const subtitle = String((card && card.subtitle) || '').trim()
      const line = subtitle ? `${title}：${subtitle}` : title
      if (line) cardLines.push(line)
    })
  })
  const parts = []
  const head = String(lead || '').trim()
  if (head) parts.push(head)
  cardLines.forEach((line) => {
    if (parts.indexOf(line) < 0) parts.push(line)
  })
  if (!parts.length) {
    asArray(lines)
      .map((l) => String(l || '').trim())
      .filter(Boolean)
      .forEach((line) => parts.push(line))
  }
  if (!parts.length && wrote) return '已处理完成'
  if (!parts.length) return copy.assist.doneEmpty
  return parts.join('\n')
}

/** 把裸卡片（只有 title、无 cards）收成一块，兼容旧回包 */
function coerceBlocks(raw) {
  const list = asArray(raw)
  if (!list.length) return []
  const hasNested = list.some((b) => b && Array.isArray(b.cards))
  if (hasNested) return list
  const cards = list.filter((row) => row && String(row.title || '').trim())
  return cards.length ? [{ cards }] : []
}

/** 通用结果块：补 key、滤空 facts/tags，供 WXML 渲染 */
function normalizeBlocks(raw) {
  return coerceBlocks(raw)
    .filter((block) => block && Array.isArray(block.cards) && block.cards.length)
    .map((block, bi) => ({
      key: `b${bi}`,
      title: String(block.title || '').trim(),
      tone: block.tone || 'neutral',
      footer: String(block.footer || '').trim(),
      cards: (block.cards || [])
        .filter((card) => card && String(card.title || '').trim())
        .map((card, ci) => {
          const facts = asArray(card.facts)
            .map((f) => String(f || '').trim())
            .filter(Boolean)
          const tags = asArray(card.tags)
            .map((t) => String(t || '').trim())
            .filter(Boolean)
          return {
            key: String(card.itemId || `c${bi}-${ci}`),
            title: String(card.title || '').trim(),
            subtitle: String(card.subtitle || '').trim(),
            facts,
            tags,
            hasFacts: facts.length > 0,
            hasTags: tags.length > 0,
            tone: card.tone || block.tone || 'neutral',
            itemId: String(card.itemId || '')
          }
        })
    }))
    .filter((block) => block.cards.length)
}

function pickPresentation(data) {
  const report = (data && data.report) || {}
  const lead = String(
    (data && data.lead) || report.lead || ''
  ).trim()
  const blocks = normalizeBlocks(
    (data && data.blocks) || report.blocks || []
  )
  return { lead, blocks, report }
}

function clearConfirmCards(messages) {
  return (messages || []).map((row) =>
    row && row.confirmList && row.confirmList.length
      ? { ...row, confirmList: [], confirmKind: '' }
      : row
  )
}

function helloMessage() {
  return {
    id: 'hello',
    role: 'assistant',
    kind: 'hello',
    text: copy.assist.hello,
    askList: [],
    confirmList: [],
    hasChips: false
  }
}

Page({
  data: {
    copy: copy.assist,
    common: copy.common,
    theme: null,
    headerTitle: copy.assist.pageTitle,
    loading: false,
    booting: true,
    fatalError: '',
    text: '',
    inputHeight: 36,
    originalText: '',
    askRound: 0,
    noKey: false,
    focusItemId: '',
    focusLabel: '',
    draft: null,
    messages: [],
    pendingCalls: [],
    scrollIntoView: '',
    composerOn: true,
    keyboardHeight: 0,
    transcriptCapped: false,
    canClear: false,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad(options) {
    const focusItemId = decodeOpt(options && options.itemId)
    const messages = [helloMessage()]
    this._seq = 1
    this._messages = messages
    this._pendingId = ''
    this._submitting = false
    this._familyId = ''
    this.initComposerMetrics()
    this._onKeyboardHeight = (res) => {
      this.applyKeyboardHeight(Math.max(0, Number((res && res.height) || 0)))
    }
    if (typeof wx.onKeyboardHeightChange === 'function') {
      wx.onKeyboardHeightChange(this._onKeyboardHeight)
    }
    bindThemeToPage(this, {
      headerTitle: copy.assist.pageTitle,
      focusItemId,
      messages,
      inputHeight: this._composerMinH
    })
  },

  async onShow() {
    bindThemeToPage(this, { headerTitle: copy.assist.pageTitle })
    this.syncLoadingColors()
    try {
      const session = await ensureSession()
      if (!session || !session.hasFamily) {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      setAppFamily(session.family)
      const familyId = String((session.family && session.family._id) || '')
      this.hydrateTranscript(familyId)
      bindThemeToPage(this, { headerTitle: copy.assist.pageTitle, booting: false })
      this.syncLoadingColors()
      if (this.data.focusItemId) this.loadFocusLabel(this.data.focusItemId)
      this.scrollToBottom()
    } catch (e) {
      this.setData({
        booting: false,
        fatalError: e.message || copy.common.loadFailed
      })
    }
  },

  onHide() {
    this.applyKeyboardHeight(0)
  },

  onUnload() {
    if (this._onKeyboardHeight && typeof wx.offKeyboardHeightChange === 'function') {
      wx.offKeyboardHeightChange(this._onKeyboardHeight)
    }
    this._onKeyboardHeight = null
    this.applyKeyboardHeight(0)
  },

  hydrateTranscript(familyId) {
    if (!familyId) return
    // 请求进行中不要用本地缓存回放覆盖，否则会把 pending/结果气泡冲掉
    if (this._submitting || this.data.loading) {
      if (this._familyId !== familyId) this._familyId = familyId
      return
    }
    if (this._familyId === familyId && (this._messages || []).length > 1) {
      this.syncTranscriptCap(this._messages)
      return
    }
    this._familyId = familyId
    const turns = loadTurns(familyId)
    const restored = turnsToMessages(turns, () => this.nextId())
    const messages = [helloMessage()].concat(restored)
    this._messages = messages
    this._pendingId = ''
    this.setData({
      messages,
      pendingCalls: [],
      askRound: 0,
      transcriptCapped: turns.length >= HISTORY_LIMIT,
      canClear: turns.length > 0
    })
  },

  syncTranscriptMeta(messages) {
    const turns = extractTurns(messages)
    const capped = turns.length >= HISTORY_LIMIT
    const canClear = turns.length > 0
    const patch = {}
    if (capped !== this.data.transcriptCapped) patch.transcriptCapped = capped
    if (canClear !== this.data.canClear) patch.canClear = canClear
    if (Object.keys(patch).length) this.setData(patch)
  },

  syncTranscriptCap(messages) {
    this.syncTranscriptMeta(messages)
  },

  persistTranscript() {
    if (!this._familyId) return
    const turns = saveTurns(this._familyId, this._messages || this.data.messages || [])
    const capped = turns.length >= HISTORY_LIMIT
    const canClear = turns.length > 0
    const patch = {}
    if (capped !== this.data.transcriptCapped) patch.transcriptCapped = capped
    if (canClear !== this.data.canClear) patch.canClear = canClear
    if (Object.keys(patch).length) this.setData(patch)
  },

  commitMessages(messages, extra) {
    this._messages = messages
    const patch = Object.assign({ messages }, extra || {})
    this.setData(patch)
    this.persistTranscript()
  },

  async onClearChat() {
    if (this.data.loading || this._submitting || !this.data.canClear) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: copy.assist.clearChatTitle,
        content: copy.assist.clearChatContent,
        confirmText: copy.assist.clearChatConfirm,
        cancelText: copy.common.cancel,
        success: (res) => resolve(!!res.confirm)
      })
    })
    if (!ok) return
    clearTurns(this._familyId)
    const messages = [helloMessage()]
    this._messages = messages
    this._pendingId = ''
    this.setData({
      messages,
      canClear: false,
      transcriptCapped: false,
      pendingCalls: [],
      askRound: 0,
      draft: null,
      originalText: '',
      text: '',
      inputHeight: this._composerMinH || this.data.inputHeight,
      scrollIntoView: ''
    })
    wx.showToast({ title: copy.assist.clearedToast, icon: 'none' })
  },

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
  },

  /** 聊天输入框：1 行起、最多约 5 行后内部滚动（对齐微信会话） */
  initComposerMetrics() {
    const win =
      typeof wx.getWindowInfo === 'function'
        ? wx.getWindowInfo()
        : wx.getSystemInfoSync()
    const rpx = (Number(win.windowWidth) || 375) / 750
    this._composerPadPx = Math.round(32 * rpx)
    this._composerLinePx = Math.round(40 * rpx)
    this._composerMaxLines = 5
    this._composerMinH = this._composerPadPx + this._composerLinePx
    this._composerMaxH =
      this._composerPadPx + this._composerLinePx * this._composerMaxLines
  },

  nextId() {
    this._seq = (this._seq || 1) + 1
    return `m${this._seq}`
  },

  scrollToBottom() {
    this.setData({ scrollIntoView: '' }, () => {
      this.setData({ scrollIntoView: 'msg-bottom' })
    })
  },

  onKeyboardHeightChange(e) {
    this.applyKeyboardHeight(Math.max(0, Number((e && e.detail && e.detail.height) || 0)))
  },

  onComposerBlur() {
    // 部分机型收起键盘不回调 height=0，失焦时强制复位
    this.applyKeyboardHeight(0)
  },

  applyKeyboardHeight(height) {
    const next = Math.max(0, Number(height) || 0)
    if (next === this.data.keyboardHeight) return
    this.setData({ keyboardHeight: next }, () => {
      if (next > 0) this.scrollToBottom()
    })
  },

  onScrollToOldest() {
    // 满额时列表顶已有 historyCapTip；滑到最上即可看见
  },

  historyPayload() {
    return historyFromMessages(this._messages || this.data.messages || [])
  },

  async loadFocusLabel(itemId) {
    try {
      const item = await callItem('get', { itemId })
      if (!item || !item._id) return
      this.setData({
        focusLabel: item.name || copy.assist.focusLabel
      })
    } catch (e) {
      this.setData({ focusItemId: '', focusLabel: '' })
    }
  },

  onTextInput(e) {
    const text = (e.detail && e.detail.value) || ''
    const patch = { text }
    if (!String(text).trim()) {
      const minH = this._composerMinH
      if (minH && this.data.inputHeight !== minH) patch.inputHeight = minH
    }
    this.setData(patch)
  },

  onInputLineChange(e) {
    const lineCount = Math.max(1, Number((e && e.detail && e.detail.lineCount) || 1))
    const maxLines = this._composerMaxLines || 5
    const pad = this._composerPadPx || 0
    const line = this._composerLinePx || 20
    const lines = Math.min(lineCount, maxLines)
    const next = pad + line * lines
    if (next === this.data.inputHeight) return
    this.setData({ inputHeight: next })
  },

  onRetry() {
    const lastUser = [...(this.data.messages || [])]
      .reverse()
      .find((row) => row.role === 'user' && row.text)
    const text = (lastUser && lastUser.text) || this.data.originalText
    if (!text) {
      this.setData({ fatalError: '' })
      return
    }
    this.submit({ resetRound: false, text, skipUserBubble: true })
  },

  onSend(e) {
    const typed = e && e.detail && typeof e.detail.value === 'string' ? e.detail.value : undefined
    this.submit({ resetRound: true, text: typed })
  },

  onPickChip(e) {
    const ds = e.currentTarget.dataset || {}
    const text = String(ds.label || ds.value || '').trim()
    if (!text || this.data.loading) return

    // 气泡只显示点选文案；act 必须带上澄清前的原句，否则只剩「厨房/冰箱」会被当成查库存
    // 禁止按芯片文案正则猜意图 / 旁路拼 calls——意图一律交模型（见 AGENTS.md）
    const original = String(this.data.originalText || '').trim()
    const actText =
      original && original !== text ? `${original}（澄清：${text}）` : text
    this.submit({ resetRound: false, text, actText })
  },

  onConfirmRemove() {
    const calls = this.data.pendingCalls || []
    if (!calls.length) {
      wx.showToast({ title: copy.common.opFailed, icon: 'none' })
      return
    }
    const isMerge = calls.some((c) => c && c.use === 'item.merge')
    // 先收起确认卡，避免合并项无 ref / WXML join 在列表 diff 时炸 weui
    const cleared = clearConfirmCards(this._messages || this.data.messages || [])
    this.commitMessages(cleared)
    this.submit({
      resetRound: false,
      confirmed: true,
      text: isMerge ? copy.assist.confirmMergeYes : copy.assist.confirmYes,
      actText: this.data.originalText || (isMerge ? copy.assist.confirmMergeYes : copy.assist.confirmYes),
      calls
    })
  },

  onCancelConfirm() {
    const pending = this.data.pendingCalls || []
    const isMerge = pending.some((c) => c && c.use === 'item.merge')
    const messages = clearConfirmCards(this._messages || this.data.messages || [])
    messages.push({
      id: this.nextId(),
      role: 'assistant',
      kind: 'result',
      text: isMerge ? copy.assist.confirmMergeCancelled : copy.assist.confirmCancelled,
      askList: [],
      confirmList: [],
      subscribeItems: []
    })
    this.commitMessages(messages, { pendingCalls: [] })
    this.scrollToBottom()
  },

  patchSubscribeItem(msgId, itemId, enabled) {
    const messages = (this._messages || this.data.messages || []).map((row) => {
      if (!row || row.id !== msgId || !row.subscribeItems) return row
      return {
        ...row,
        subscribeItems: row.subscribeItems.map((item) =>
          item && item.itemId === itemId
            ? { ...item, expireReminderEnabled: !!enabled }
            : item
        )
      }
    })
    this._messages = messages
    this.setData({ messages })
  },

  async onToggleSubscribe(e) {
    const ds = e.currentTarget.dataset || {}
    const msgId = String(ds.msgid || '')
    const itemId = String(ds.itemid || '')
    const enabled = !!(e.detail && e.detail.value)
    if (!msgId || !itemId || this._togglingSub) return
    this._togglingSub = true
    const prev = !enabled
    this.patchSubscribeItem(msgId, itemId, enabled)
    try {
      if (enabled) {
        await requestExpireSubscribe(callFamily)
      }
      await callItem('update', {
        itemId,
        expireReminderEnabled: enabled
      })
      invalidateItemDomain()
    } catch (err) {
      this.patchSubscribeItem(msgId, itemId, prev)
      wx.showToast({
        title: (err && err.message) || copy.assist.subscribeFail,
        icon: 'none'
      })
    } finally {
      this._togglingSub = false
    }
  },

  goKeys() {
    wx.navigateTo({
      url: '/packageAi/keys/index',
      fail: () => wx.showToast({ title: copy.ai.fabFail, icon: 'none' })
    })
  },

  goSpaces() {
    wx.navigateTo({
      url: '/packageBrowse/spaces/index',
      fail: () => wx.showToast({ title: copy.assist.openFail, icon: 'none' })
    })
  },

  goEdit() {
    const draft = this.data.draft || {}
    const q = []
    if (draft.name) q.push(`name=${encodeURIComponent(draft.name)}`)
    if (draft.quantity != null && draft.quantity !== '') {
      q.push(`quantity=${encodeURIComponent(draft.quantity)}`)
    }
    if (draft.unit) q.push(`unit=${encodeURIComponent(draft.unit)}`)
    if (draft.note) q.push(`note=${encodeURIComponent(draft.note)}`)
    if (draft.spaceName) q.push(`spaceName=${encodeURIComponent(draft.spaceName)}`)
    if (draft.locationName) q.push(`locationName=${encodeURIComponent(draft.locationName)}`)
    if (draft.expireDate) q.push(`expireDate=${encodeURIComponent(draft.expireDate)}`)
    if (draft.productionDate) q.push(`productionDate=${encodeURIComponent(draft.productionDate)}`)
    const qs = q.length ? `?${q.join('&')}` : ''
    wx.navigateTo({ url: `/pages/items/edit${qs}` })
  },

  async submit(options = {}) {
    if (this.data.loading || this._submitting) return
    const text = String(options.text != null ? options.text : this.data.text || '').trim()
    if (!text) {
      wx.showToast({ title: copy.assist.emptyText, icon: 'none' })
      return
    }

    this._submitting = true
    const resetRound = options.resetRound !== false
    const askRound = resetRound ? 0 : this.data.askRound
    const actText = String(options.actText || text).trim()
    let history = this.historyPayload()
    if (history.length) {
      const last = history[history.length - 1]
      if (last.role === 'user' && last.text === actText) {
        history = history.slice(0, -1)
      }
    }
    // 本地镜像：await 后不要只信 this.data.messages（setData 异步时会找不到 pending，结果气泡就没了）
    const messages = (this._messages || this.data.messages || []).slice()
    if (options.skipUserBubble) {
      const last = messages[messages.length - 1]
      if (last && last.role === 'assistant' && last.retry) messages.pop()
    }
    if (!options.skipUserBubble) {
      messages.push({
        id: this.nextId(),
        role: 'user',
        text,
        askList: [],
        confirmList: []
      })
    }
    const pendingId = this.nextId()
    messages.push({
      id: pendingId,
      role: 'assistant',
      kind: 'pending',
      text: copy.assist.sending,
      askList: [],
      confirmList: []
    })
    this._messages = messages
    this._pendingId = pendingId

    this.setData({
      loading: true,
      fatalError: '',
      noKey: false,
      text: '',
      inputHeight: this._composerMinH || this.data.inputHeight,
      composerOn: false,
      originalText: resetRound ? actText : this.data.originalText || actText,
      messages
    }, () => {
      this.setData({ composerOn: true })
    })
    this.persistTranscript()
    this.scrollToBottom()

    try {
      const data = await callAi('act', {
        text: actText,
        focusItemId: this.data.focusItemId || '',
        confirmed: !!options.confirmed,
        history,
        calls: options.calls || undefined
      })
      if (data && data.wrote) {
        invalidateItemDomain()
      }
      this.applyResult(data, askRound)
    } catch (e) {
      if (e.code === 'NO_AI_KEY') {
        this.replacePending(
          {
            text: copy.assist.noKey,
            goKeys: true,
            askList: [],
            confirmList: []
          },
          { noKey: true }
        )
        return
      }
      if (e.code === 'AI_QUOTA') {
        this.replacePending({
          text: e.message || copy.assist.quotaExhausted,
          goKeys: true,
          askList: [],
          confirmList: []
        })
        return
      }
      if (e.code === 'NO_FAMILY') {
        setAppFamily(null)
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      this.replacePending({
        text: e.message || copy.common.opFailed,
        retry: true,
        askList: [],
        confirmList: []
      })
    } finally {
      this._submitting = false
      if (this.data.loading) this.setData({ loading: false })
    }
  },

  replacePending(patch, extra) {
    const messages = (this._messages || this.data.messages || []).slice()
    let realIdx = -1
    if (this._pendingId) {
      realIdx = messages.findIndex((row) => row && row.id === this._pendingId)
    }
    if (realIdx < 0) {
      const idx = [...messages].reverse().findIndex((row) => row && row.kind === 'pending')
      realIdx = idx >= 0 ? messages.length - 1 - idx : -1
    }
    // 换新 id：pending→结果结构变化大，同 id 差分偶发把气泡渲成空白
    const next = {
      id: this.nextId(),
      role: 'assistant',
      kind: 'result',
      text: '',
      askList: [],
      confirmList: [],
      hasChips: false,
      blocks: [],
      subscribeItems: [],
      ...patch
    }
    if (!String(next.text || '').trim()) {
      next.text = copy.assist.doneEmpty
    }
    if (realIdx >= 0) messages[realIdx] = next
    else messages.push(next)
    this._messages = messages
    this._pendingId = ''
    const data = Object.assign({ messages, loading: false }, extra || {})
    this.setData(data)
    this.persistTranscript()
    this.scrollToBottom()
  },

  applyResult(data, askRound) {
    const status = data && data.status
    const draft = cleanDraft((data && data.draft) || this.data.draft)

    if (status === 'ask') {
      const nextRound = askRound + 1
      const askList = asArray(data && data.ask)
      const text =
        askList.map((row) => row.question).filter(Boolean).join('\n') || copy.assist.askTitle
      const hasChips = askList.some((row) => row && row.options && row.options.length)
      const goSpaces = !hasChips && /不能删除房间|不能删除空间|不能新建空间|不能新建房间/.test(text)
      this.replacePending(
        {
          text,
          askList,
          hasChips,
          goSpaces,
          confirmList: [],
          showEdit: nextRound >= 2 && hasChips
        },
        {
          askRound: nextRound,
          draft,
        }
      )
      return
    }

    if (status === 'confirm') {
      const confirmList = normalizeConfirmList(asArray(data && data.confirm))
      const confirmKind = confirmList.some((row) => row && row.use === 'item.merge')
        ? 'merge'
        : data && data.confirmKind === 'removeUpdated'
          ? 'removeUpdated'
          : 'remove'
      const title =
        (data && data.confirmTitle) ||
        (confirmKind === 'merge'
          ? copy.assist.confirmMergeTitle
          : confirmKind === 'removeUpdated'
            ? copy.assist.confirmTitleUpdated
            : copy.assist.confirmTitle)
      const confirmHint =
        (data && data.confirmHint) ||
        (confirmKind === 'removeUpdated' ? copy.assist.confirmHintUpdated : '')
      this.replacePending(
        {
          text: title,
          confirmHint,
          askList: [],
          confirmList,
          confirmKind,
          subscribeItems: []
        },
        {
          draft,
          pendingCalls: asArray(data && data.calls)
        }
      )
      return
    }

    if (status === 'subscribe') {
      const { lead, blocks, report } = pickPresentation(data)
      const lines = asArray(report.lines).filter(Boolean)
      this.replacePending(
        {
          text: buildResultText(lead, blocks, lines, false) || copy.assist.subscribeTitle,
          blocks,
          askList: [],
          confirmList: [],
          subscribeItems: asArray(data && data.subscribeItems)
        },
        {
          askRound: 0,
          draft,
          pendingCalls: []
        }
      )
      return
    }

    const { lead, blocks, report } = pickPresentation(data)
    const lines = asArray(report.lines).filter(Boolean)
    if (
      !blocks.length &&
      report.possibleDuplicates &&
      report.possibleDuplicates.length
    ) {
      lines.push(
        copy.assist.duplicatesTitle +
          '：' +
          report.possibleDuplicates
            .map((item) => {
              const place = [item.spaceName, item.locationName].filter(Boolean).join(' / ')
              return `${item.name}${place ? `（${place}）` : ''} ${item.count} 条`
            })
            .join('；')
      )
    }
    const text = buildResultText(lead, blocks, lines, !!(data && data.wrote))
    this.replacePending(
      {
        text,
        blocks,
        askList: [],
        confirmList: [],
        subscribeItems: []
      },
      {
        askRound: 0,
        draft,
        pendingCalls: []
      }
    )
  }
})
