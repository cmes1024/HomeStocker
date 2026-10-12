const { callAi } = require('../utils/callAi')
const {
  HISTORY_LIMIT,
  loadTurns,
  saveTurns,
  clearTurns,
  turnsToMessages,
  historyFromMessages,
  extractTurns,
  bubbleTextWithoutBlockDup,
  stampMessage
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

/**
 * 气泡文案 = 下一轮 history 原文。
 * 须带上 UI 里有语义的块标题（如「可能重复（未合并）」），不能只留卡片名；
 * presentation.lines 一并并入，避免汇总句只进报告、不进模型。
 */
function buildResultText(lead, blocks, lines, wrote) {
  const parts = []
  const seen = {}
  function push(s) {
    const t = String(s || '').trim()
    if (!t || seen[t]) return
    seen[t] = true
    parts.push(t)
  }

  push(lead)

  asArray(blocks).forEach((block) => {
    const blockTitle = String((block && block.title) || '').trim()
    asArray(block && block.cards).forEach((card) => {
      const title = String((card && card.title) || '').trim()
      const subtitle = String((card && card.subtitle) || '').trim()
      const line = subtitle ? `${title}：${subtitle}` : title
      if (!line) return
      push(blockTitle ? `${blockTitle}：${line}` : line)
    })
  })

  asArray(lines)
    .map((l) => String(l || '').trim())
    .filter(Boolean)
    .forEach(push)

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
  const present = normalizePresent(data && data.present)
  const habitApplied = normalizeHabitApplied(
    (data && data.habitApplied) || report.habitApplied
  )
  return { lead, blocks, report, present, habitApplied }
}

function normalizeHabitApplied(raw) {
  const list = asArray(raw)
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const label = String(row.label || '').trim()
      const text = String(row.text || '').trim()
      const slot = String(row.slot || '').trim()
      if (!label && !slot) return null
      return { slot, label: label || slot, text }
    })
    .filter(Boolean)
  return list.length ? list : null
}

function habitAppliedLine(habitApplied) {
  if (!habitApplied || !habitApplied.length) return ''
  const labels = habitApplied.map((h) => h.label).filter(Boolean)
  if (!labels.length) return ''
  return '根据习惯：' + labels.join('、')
}

/** 服务端 present 白名单：table / stats / bars / pie */
function normalizePresent(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = String(raw.type || '')
    .trim()
    .toLowerCase()
  const title = String(raw.title || '').trim()
  if (type === 'table') {
    const columns = asArray(raw.columns)
      .map((c) => String(c || '').trim())
      .filter(Boolean)
      .slice(0, 6)
    const rows = asArray(raw.rows)
      .map((row, ri) => {
        const cellsSrc = Array.isArray(row)
          ? row
          : row && Array.isArray(row.cells)
            ? row.cells
            : []
        const cells = cellsSrc
          .map((c) => String(c == null ? '' : c).trim())
          .slice(0, columns.length || 6)
        while (columns.length && cells.length < columns.length) cells.push('')
        return { key: `r${ri}`, cells }
      })
      .filter((row) => row.cells.some((c) => c))
      .slice(0, 40)
    if (!columns.length || !rows.length) return null
    return {
      type: 'table',
      title,
      columns,
      rows,
      footer: String(raw.footer || '').trim(),
      colCount: columns.length
    }
  }
  if (
    type === 'stats' ||
    type === 'stat' ||
    type === 'bars' ||
    type === 'bar' ||
    type === 'pie' ||
    type === 'donut'
  ) {
    let kind = 'stats'
    if (type === 'bars' || type === 'bar') kind = 'bars'
    else if (type === 'pie' || type === 'donut') kind = 'pie'
    const items = asArray(raw.items)
      .map((it, i) => {
        if (!it || typeof it !== 'object') return null
        const label = String(it.label || it.name || '').trim()
        if (!label) return null
        const value = it.value != null ? it.value : it.count
        const pct = Math.max(0, Math.min(100, Number(it.pct) || 0))
        const share = Math.max(0, Math.min(100, Number(it.share) || 0))
        const color = sanitizePresentColor(it.color, i)
        return {
          key: `i${i}`,
          label: label.slice(0, 40),
          value: String(value == null ? '' : value).trim().slice(0, 24),
          pct,
          share,
          shareLabel: share > 0 ? `${share}%` : '',
          color,
          fillStyle: `width: ${pct}%; background: ${color};`
        }
      })
      .filter(Boolean)
      .slice(0, 12)
    if (!items.length) return null
    const out = { type: kind, title, items }
    if (kind === 'pie') {
      const pieCss = String(raw.pieCss || '').trim()
      out.pieCss = /^conic-gradient\(/i.test(pieCss) ? pieCss.slice(0, 800) : buildPieCss(items)
      out.pieStyle = out.pieCss ? `background: ${out.pieCss};` : ''
    }
    return out
  }
  return null
}

const PRESENT_PALETTE = [
  '#C4A484',
  '#7A9E7E',
  '#6B8CAE',
  '#C48B7A',
  '#9A8BB5',
  '#B5A06A',
  '#6A9B9B',
  '#A67C7C',
  '#8A9A6B',
  '#7A8BA8',
  '#B58A6A',
  '#8B7A9A'
]

function sanitizePresentColor(raw, index) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
  if (/^#[0-9A-F]{6}$/.test(s)) return s
  return PRESENT_PALETTE[index % PRESENT_PALETTE.length]
}

function buildPieCss(items) {
  const list = asArray(items).filter((it) => it && Number(it.share) > 0)
  if (!list.length) return ''
  let cursor = 0
  const parts = []
  list.forEach((it) => {
    const share = Math.max(0, Math.min(100, Number(it.share) || 0))
    if (share <= 0) return
    const end = Math.min(100, cursor + share)
    parts.push(`${it.color} ${cursor}% ${end}%`)
    cursor = end
  })
  if (!parts.length) return ''
  if (cursor < 100) parts.push(`rgba(26,26,26,0.06) ${cursor}% 100%`)
  return `conic-gradient(${parts.join(', ')})`
}

function presentToHistoryText(present) {
  if (!present) return ''
  const parts = []
  if (present.title) parts.push(present.title)
  if (present.type === 'table') {
    parts.push(present.columns.join(' / '))
    asArray(present.rows).forEach((row) => {
      const line = asArray(row.cells).filter(Boolean).join(' · ')
      if (line) parts.push(line)
    })
    if (present.footer) parts.push(present.footer)
  } else if (present.type === 'stats' || present.type === 'bars' || present.type === 'pie') {
    asArray(present.items).forEach((it) => {
      const share = it.shareLabel || (it.share > 0 ? `${it.share}%` : '')
      parts.push(`${it.label} ${it.value}${share ? `（${share}）` : ''}`.trim())
    })
  }
  return parts.join('\n')
}

/** 仅信任服务端下发的白名单 URL */
function normalizeNavLinks(raw) {
  const out = []
  const seen = {}
  ;(raw || []).forEach((link, i) => {
    if (!link || typeof link !== 'object') return
    const url = String(link.url || '').trim()
    if (!url || url.indexOf('/') !== 0) return
    if (seen[url]) return
    seen[url] = true
    out.push({
      key: `nav${i}`,
      label: String(link.label || '打开页面').trim().slice(0, 40) || '打开页面',
      url: url.slice(0, 500),
      pageId: String(link.pageId || '').trim().slice(0, 64)
    })
  })
  return out.slice(0, 5)
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
    originalText: '',
    askRound: 0,
    noKey: false,
    focusItemId: '',
    focusLabel: '',
    draft: null,
    messages: [],
    pendingCalls: [],
    scrollIntoView: '',
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
    this.setData({ text: (e.detail && e.detail.value) || '' })
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
    const detail = (e && e.detail) || {}
    const typed = typeof detail.text === 'string' ? detail.text : undefined
    this.submit({
      resetRound: true,
      text: typed,
      keepDraft: detail.source === 'voice'
    })
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
    messages.push(
      stampMessage({
        id: this.nextId(),
        role: 'assistant',
        kind: 'result',
        text: isMerge ? copy.assist.confirmMergeCancelled : copy.assist.confirmCancelled,
        askList: [],
        confirmList: [],
        subscribeItems: []
      })
    )
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

  onTapNavLink(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const url = String(ds.url || '').trim()
    if (!url || url.indexOf('/') !== 0) {
      wx.showToast({ title: copy.assist.navOpenFail, icon: 'none' })
      return
    }
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: copy.assist.navOpenFail, icon: 'none' })
    })
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
      messages.push(
        stampMessage({
          id: this.nextId(),
          role: 'user',
          text,
          askList: [],
          confirmList: []
        })
      )
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

    await new Promise((resolve) => {
      this.setData(
        {
          loading: true,
          fatalError: '',
          noKey: false,
          text: options.keepDraft ? String(this.data.text || '') : '',
          originalText: resetRound ? actText : this.data.originalText || actText,
          messages
        },
        resolve
      )
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
      // loading 由 replacePending 关闭；此处再 setData 会与结果气泡并发，偶发丢掉渲染
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
    let next = {
      id: this.nextId(),
      role: 'assistant',
      kind: 'result',
      text: '',
      askList: [],
      confirmList: [],
      hasChips: false,
      blocks: [],
      present: null,
      subscribeItems: [],
      navLinks: [],
      ...patch
    }
    if (!String(next.text || '').trim()) {
      if (!next.present) {
        next.text = copy.assist.doneEmpty
      }
    }
    if (next.present) {
      const covered = {
        [copy.assist.doneEmpty]: true,
        没有需要执行的操作: true
      }
      String(presentToHistoryText(next.present) || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((l) => {
          covered[l] = true
        })
      next.bubbleText = String(next.text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !covered[l])
        .join('\n')
    } else if (next.bubbleText == null) {
      next.bubbleText = bubbleTextWithoutBlockDup(next.text, next.blocks)
    }
    next = stampMessage(next)
    if (realIdx >= 0) messages[realIdx] = next
    else messages.push(next)
    this._messages = messages
    this._pendingId = ''
    const data = Object.assign({ messages, loading: false }, extra || {})
    // 串行 setData：与 scrollIntoView 并发时，偶发丢掉刚写入的结果气泡（重进页才从落盘恢复）
    this.setData(data, () => {
      this.persistTranscript()
      this.scrollToBottom()
    })
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
      const { lead, blocks, report, present } = pickPresentation(data)
      const lines = asArray(report.lines).filter(Boolean)
      const text = [buildResultText(lead, blocks, lines, false), presentToHistoryText(present)]
        .filter(Boolean)
        .join('\n')
      this.replacePending(
        {
          text: text || copy.assist.subscribeTitle,
          blocks,
          present,
          askList: [],
          confirmList: [],
          subscribeItems: asArray(data && data.subscribeItems),
          navLinks: normalizeNavLinks(data && data.navLinks)
        },
        {
          askRound: 0,
          draft,
          pendingCalls: []
        }
      )
      return
    }

    const { lead, blocks, report, present } = pickPresentation(data)
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
    const habitApplied = normalizeHabitApplied(
      (data && data.habitApplied) || report.habitApplied
    )
    const habitLine = habitAppliedLine(habitApplied)
    const textParts = [
      buildResultText(lead, blocks, lines, !!(data && data.wrote)),
      presentToHistoryText(present)
    ].filter(Boolean)
    // 有结构化展示时，丢掉空操作占位文案
    let text = textParts
      .join('\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== copy.assist.doneEmpty && l !== '没有需要执行的操作')
      .join('\n')
    if (habitLine && text.includes(habitLine)) {
      text = text
        .split('\n')
        .filter((l) => l.trim() !== habitLine)
        .join('\n')
        .trim()
    }
    this.replacePending(
      {
        text: text || (present ? presentToHistoryText(present) : copy.assist.doneEmpty),
        blocks: present ? [] : blocks,
        present,
        habitApplied,
        habitAppliedText: habitLine,
        askList: [],
        confirmList: [],
        subscribeItems: [],
        navLinks: normalizeNavLinks(data && data.navLinks)
      },
      {
        askRound: 0,
        draft,
        pendingCalls: []
      }
    )
  }
})
