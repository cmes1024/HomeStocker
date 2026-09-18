const { callAi } = require('../utils/callAi')
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

function mergeRecentIds(prev, incoming, removed) {
  const drop = {}
  ;(removed || []).forEach((id) => {
    if (id) drop[id] = true
  })
  const out = []
  const seen = {}
  ;(incoming || [])
    .concat(prev || [])
    .forEach((id) => {
      if (!id || seen[id] || drop[id]) return
      seen[id] = true
      out.push(id)
    })
  return out.slice(0, 6)
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

/** 通用结果块：补 key、滤空 facts/tags，供 WXML 渲染 */
function normalizeBlocks(raw) {
  return (raw || [])
    .filter((block) => block && Array.isArray(block.cards) && block.cards.length)
    .map((block, bi) => ({
      key: `b${bi}`,
      title: String(block.title || '').trim(),
      tone: block.tone || 'neutral',
      footer: String(block.footer || '').trim(),
      cards: (block.cards || [])
        .filter((card) => card && String(card.title || '').trim())
        .map((card, ci) => {
          const facts = (card.facts || [])
            .map((f) => String(f || '').trim())
            .filter(Boolean)
          const tags = (card.tags || [])
            .map((t) => String(t || '').trim())
            .filter(Boolean)
          return {
            key: card.itemId || `c${bi}-${ci}`,
            title: String(card.title || '').trim(),
            subtitle: String(card.subtitle || '').trim(),
            facts,
            tags,
            hasFacts: facts.length > 0,
            hasTags: tags.length > 0,
            tone: card.tone || block.tone || 'neutral',
            itemId: card.itemId || ''
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
    originalText: '',
    askRound: 0,
    noKey: false,
    focusItemId: '',
    focusLabel: '',
    draft: null,
    messages: [],
    recentItemIds: [],
    pendingCalls: [],
    scrollIntoView: '',
    composerOn: true,
    loadingColors: ['#C4A484', '#8B6914']
  },

  onLoad(options) {
    const focusItemId = decodeOpt(options && options.itemId)
    const messages = [
      {
        id: 'hello',
        role: 'assistant',
        kind: 'hello',
        text: copy.assist.hello,
        askList: [],
        confirmList: [],
        hasChips: false
      }
    ]
    this._seq = 1
    this._messages = messages
    this._pendingId = ''
    this._submitting = false
    bindThemeToPage(this, {
      headerTitle: copy.assist.pageTitle,
      focusItemId,
      messages
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

  syncLoadingColors() {
    const color = (this.data.theme && this.data.theme.themeColor) || '#C4A484'
    const prev = this.data.loadingColors
    if (prev && prev[0] === color && prev[1] === color) return
    this.setData({ loadingColors: [color, color] })
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

  historyPayload() {
    return (this.data.messages || [])
      .filter((row) => row && row.text && row.kind !== 'hello' && row.kind !== 'pending')
      .slice(-15)
      .map((row) => ({
        role: row.role === 'assistant' ? 'assistant' : 'user',
        text: String(row.text).slice(0, 200)
      }))
  },

  async loadFocusLabel(itemId) {
    try {
      const item = await callItem('get', { itemId })
      if (!item || !item._id) return
      this.setData({
        focusLabel: item.name || copy.assist.focusLabel,
        recentItemIds: mergeRecentIds(this.data.recentItemIds, [item._id], [])
      })
    } catch (e) {
      this.setData({ focusItemId: '', focusLabel: '' })
    }
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value || '' })
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
    this._messages = cleared
    this.setData({ messages: cleared })
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
    this._messages = messages
    this.setData({ messages, pendingCalls: [] })
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
      composerOn: false,
      originalText: resetRound ? actText : this.data.originalText || actText,
      messages
    }, () => {
      this.setData({ composerOn: true })
    })
    this.scrollToBottom()

    try {
      const data = await callAi('act', {
        text: actText,
        focusItemId: this.data.focusItemId || '',
        confirmed: !!options.confirmed,
        history,
        recentItemIds: this.data.recentItemIds || [],
        calls: options.calls || undefined
      })
      if (data && data.wrote) {
        invalidateItemDomain()
      }
      this.applyResult(data, askRound)
    } catch (e) {
      if (e.code === 'NO_AI_KEY') {
        this.replacePending({
          text: copy.assist.noKey,
          askList: [],
          confirmList: []
        })
        this.setData({
          noKey: true
        })
        this.scrollToBottom()
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
      this.scrollToBottom()
    } finally {
      this._submitting = false
      this.setData({ loading: false })
    }
  },

  replacePending(patch) {
    const messages = (this._messages || this.data.messages || []).slice()
    let realIdx = -1
    if (this._pendingId) {
      realIdx = messages.findIndex((row) => row && row.id === this._pendingId)
    }
    if (realIdx < 0) {
      const idx = [...messages].reverse().findIndex((row) => row && row.kind === 'pending')
      realIdx = idx >= 0 ? messages.length - 1 - idx : -1
    }
    const next = {
      id: realIdx >= 0 ? messages[realIdx].id : this.nextId(),
      role: 'assistant',
      kind: 'result',
      askList: [],
      confirmList: [],
      hasChips: false,
      ...patch
    }
    if (realIdx >= 0) messages[realIdx] = next
    else messages.push(next)
    this._messages = messages
    this._pendingId = ''
    this.setData({ messages })
  },

  applyResult(data, askRound) {
    const status = data && data.status
    const draft = (data && data.draft) || this.data.draft
    const recentItemIds = mergeRecentIds(
      this.data.recentItemIds,
      ((data && data.recentItems) || []).map((row) => row && row.itemId),
      (data && data.removedItemIds) || []
    )

    if (status === 'ask') {
      const nextRound = askRound + 1
      const askList = (data && data.ask) || []
      const text =
        askList.map((row) => row.question).filter(Boolean).join('\n') || copy.assist.askTitle
      const hasChips = askList.some((row) => row && row.options && row.options.length)
      const goSpaces = !hasChips && /不能删除房间|不能删除空间|不能新建空间|不能新建房间/.test(text)
      this.replacePending({
        text,
        askList,
        hasChips,
        goSpaces,
        confirmList: [],
        showEdit: nextRound >= 2 && hasChips
      })
      this.setData({
        askRound: nextRound,
        draft,
        recentItemIds
      })
      this.scrollToBottom()
      return
    }

    if (status === 'confirm') {
      const confirmList = normalizeConfirmList((data && data.confirm) || [])
      const confirmKind = confirmList.some((row) => row && row.use === 'item.merge')
        ? 'merge'
        : 'remove'
      this.replacePending({
        text:
          confirmKind === 'merge' ? copy.assist.confirmMergeTitle : copy.assist.confirmTitle,
        askList: [],
        confirmList,
        confirmKind,
        subscribeItems: []
      })
      this.setData({
        draft,
        recentItemIds,
        pendingCalls: (data && data.calls) || []
      })
      this.scrollToBottom()
      return
    }

    if (status === 'subscribe') {
      const { lead, blocks, report } = pickPresentation(data)
      const lines = (report.lines || []).filter(Boolean)
      this.replacePending({
        text: lead || lines.join('\n').trim() || copy.assist.subscribeTitle,
        blocks,
        askList: [],
        confirmList: [],
        subscribeItems: (data && data.subscribeItems) || []
      })
      this.setData({
        askRound: 0,
        draft,
        recentItemIds,
        pendingCalls: []
      })
      this.scrollToBottom()
      return
    }

    const { lead, blocks, report } = pickPresentation(data)
    const fallbackReport = report.lines
      ? report
      : {
          lines: [copy.assist.doneEmpty],
          possibleDuplicates: []
        }
    const lines = (fallbackReport.lines || []).slice().filter(Boolean)
    if (
      !blocks.length &&
      fallbackReport.possibleDuplicates &&
      fallbackReport.possibleDuplicates.length
    ) {
      lines.push(
        copy.assist.duplicatesTitle +
          '：' +
          fallbackReport.possibleDuplicates
            .map((item) => {
              const place = [item.spaceName, item.locationName].filter(Boolean).join(' / ')
              return `${item.name}${place ? `（${place}）` : ''} ${item.count} 条`
            })
            .join('；')
      )
    }
    // 有结构化块时 lead 作气泡；无块时退回 lines 文本兜底
    let text = lead
    if (!blocks.length) {
      text = lines.join('\n').trim()
    }
    if (!text && !blocks.length && data && data.wrote) {
      text = '已处理完成'
    }
    if (!text && !blocks.length) text = copy.assist.doneEmpty
    this.replacePending({
      text,
      blocks,
      askList: [],
      confirmList: [],
      subscribeItems: []
    })
    this.setData({
      askRound: 0,
      draft,
      recentItemIds,
      pendingCalls: []
    })
    this.scrollToBottom()
  }
})
