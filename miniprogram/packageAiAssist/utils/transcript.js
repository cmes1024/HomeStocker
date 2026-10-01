const { getStorage, setStorage } = require('../../utils/storage')

const HISTORY_LIMIT = 20
/** 单轮送模型 / 落盘文本上限；须与云函数 HISTORY_TEXT_MAX 同步 */
const TEXT_MAX = 800
const BLOCKS_MAX = 6
const CARDS_PER_BLOCK_MAX = 12
const KEY_PREFIX = 'assist_transcript_'

/** 与云函数 model.js isQtyReceiptText / truncatePreferReceipts 同步 */
function isQtyReceiptText(text) {
  const t = String(text || '')
  return t.indexOf('已改') >= 0 && t.indexOf('→') >= 0
}

function truncatePreferReceipts(rows, limit) {
  const list = rows || []
  const max = Number(limit) > 0 ? Number(limit) : HISTORY_LIMIT
  if (list.length <= max) return list
  const keep = {}
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i]
    if (row && row.role === 'assistant' && isQtyReceiptText(row.text)) {
      keep[i] = true
      if (Object.keys(keep).length >= max) break
    }
  }
  for (let i = list.length - 1; i >= 0 && Object.keys(keep).length < max; i--) {
    keep[i] = true
  }
  return list.filter((_, i) => keep[i])
}

function storageKey(familyId) {
  const id = String(familyId || '').trim()
  return id ? `${KEY_PREFIX}${id}` : ''
}

/** 落盘用：裁剪 blocks，避免本地存储膨胀 */
function sanitizeBlocks(raw) {
  return (raw || [])
    .filter((block) => block && Array.isArray(block.cards) && block.cards.length)
    .slice(0, BLOCKS_MAX)
    .map((block, bi) => ({
      key: `b${bi}`,
      title: String(block.title || '').trim().slice(0, 80),
      tone: block.tone || 'neutral',
      footer: String(block.footer || '').trim().slice(0, 120),
      cards: (block.cards || [])
        .filter((card) => card && String(card.title || '').trim())
        .slice(0, CARDS_PER_BLOCK_MAX)
        .map((card, ci) => {
          const facts = (card.facts || [])
            .map((f) => String(f || '').trim())
            .filter(Boolean)
            .slice(0, 8)
          const tags = (card.tags || [])
            .map((t) => String(t || '').trim())
            .filter(Boolean)
            .slice(0, 8)
          return {
            key: String(card.itemId || `c${bi}-${ci}`).slice(0, 64),
            title: String(card.title || '').trim().slice(0, 200),
            subtitle: String(card.subtitle || '').trim().slice(0, 120),
            facts,
            tags,
            hasFacts: facts.length > 0,
            hasTags: tags.length > 0,
            tone: card.tone || block.tone || 'neutral',
            itemId: String(card.itemId || '').slice(0, 64)
          }
        })
    }))
    .filter((block) => block.cards.length)
}

/** 落盘用：与页面 normalizePresent 对齐的白名单结构 */
function sanitizePresent(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = String(raw.type || '')
    .trim()
    .toLowerCase()
  const title = String(raw.title || '').trim().slice(0, 80)
  if (type === 'table') {
    const columns = (Array.isArray(raw.columns) ? raw.columns : [])
      .map((c) => String(c || '').trim())
      .filter(Boolean)
      .slice(0, 6)
    const rows = (Array.isArray(raw.rows) ? raw.rows : [])
      .map((row, ri) => {
        const cellsSrc = Array.isArray(row)
          ? row
          : row && Array.isArray(row.cells)
            ? row.cells
            : []
        const cells = cellsSrc
          .map((c) => String(c == null ? '' : c).trim().slice(0, 80))
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
      footer: String(raw.footer || '').trim().slice(0, 120),
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
    const palette = [
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
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((it, i) => {
        if (!it || typeof it !== 'object') return null
        const label = String(it.label || it.name || '').trim()
        if (!label) return null
        const value = it.value != null ? it.value : it.count
        const pct = Math.max(0, Math.min(100, Number(it.pct) || 0))
        const share = Math.max(0, Math.min(100, Number(it.share) || 0))
        let color = String(it.color || '')
          .trim()
          .toUpperCase()
        if (!/^#[0-9A-F]{6}$/.test(color)) color = palette[i % palette.length]
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
      if (/^conic-gradient\(/i.test(pieCss)) {
        out.pieCss = pieCss.slice(0, 800)
      } else {
        let cursor = 0
        const parts = []
        items.forEach((it) => {
          if (!it.share) return
          const end = Math.min(100, cursor + it.share)
          parts.push(`${it.color} ${cursor}% ${end}%`)
          cursor = end
        })
        if (parts.length) {
          if (cursor < 100) parts.push(`rgba(26,26,26,0.06) ${cursor}% 100%`)
          out.pieCss = `conic-gradient(${parts.join(', ')})`
        }
      }
      out.pieStyle = out.pieCss ? `background: ${out.pieCss};` : ''
    }
    return out
  }
  return null
}

/** present 摊进 text 的行，用于恢复时去掉与表格重复的气泡正文 */
function presentHistoryLines(present) {
  if (!present) return []
  const parts = []
  if (present.title) parts.push(String(present.title).trim())
  if (present.type === 'table') {
    const cols = (present.columns || []).map((c) => String(c || '').trim()).filter(Boolean)
    if (cols.length) parts.push(cols.join(' / '))
    ;(present.rows || []).forEach((row) => {
      const cells = Array.isArray(row)
        ? row
        : row && Array.isArray(row.cells)
          ? row.cells
          : []
      const line = cells.map((c) => String(c || '').trim()).filter(Boolean).join(' · ')
      if (line) parts.push(line)
    })
    const footer = String(present.footer || '').trim()
    if (footer) parts.push(footer)
  } else if (present.type === 'stats' || present.type === 'bars' || present.type === 'pie') {
    ;(present.items || []).forEach((it) => {
      if (!it) return
      const share = String(it.shareLabel || (it.share > 0 ? `${it.share}%` : '')).trim()
      const line = `${String(it.label || '').trim()} ${String(it.value || '').trim()}${
        share ? `（${share}）` : ''
      }`.trim()
      if (line) parts.push(line)
    })
  }
  return parts.filter(Boolean)
}

function bubbleTextWithoutPresentDup(text, present) {
  const covered = {}
  presentHistoryLines(present).forEach((l) => {
    covered[l] = true
  })
  covered['没有需要执行的操作'] = true
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !covered[l])
    .join('\n')
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 解析发言时间（epoch ms）；无效则 0 */
function parseAt(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * 气泡右下角时间：当天 HH:mm；同年 MM-DD HH:mm；跨年 YYYY-MM-DD HH:mm。
 * 用设备本地时区（家人看到的「什么时候说的」）。
 */
function formatBubbleTime(at) {
  const ms = parseAt(at)
  if (!ms) return ''
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return ''
  const now = new Date()
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return hm
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (d.getFullYear() === now.getFullYear()) return `${md} ${hm}`
  return `${d.getFullYear()}-${md} ${hm}`
}

/** 给新消息打上 at + timeLabel（已有合法 at 则保留，否则用当前时刻） */
function stampMessage(row, at) {
  const base = row && typeof row === 'object' ? row : {}
  const ts = parseAt(at != null ? at : base.at) || Date.now()
  return Object.assign({}, base, { at: ts, timeLabel: formatBubbleTime(ts) })
}

/** 冷启动恢复：仅当落盘有合法 at 才显示时间，不伪造 */
function attachStoredTime(row, at) {
  const base = row && typeof row === 'object' ? row : {}
  const ts = parseAt(at != null ? at : base.at)
  if (!ts) return Object.assign({}, base)
  return Object.assign({}, base, { at: ts, timeLabel: formatBubbleTime(ts) })
}

function normalizeTurn(row) {
  if (!row || typeof row !== 'object') return null
  const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : ''
  if (!role) return null
  const text = String(row.text || '').trim().slice(0, TEXT_MAX)
  const blocks = role === 'assistant' ? sanitizeBlocks(row.blocks) : []
  const present = role === 'assistant' ? sanitizePresent(row.present) : null
  if (!text && !blocks.length && !present) return null
  const turn = { role, text: text || (blocks.length || present ? '完成' : '') }
  if (blocks.length) turn.blocks = blocks
  if (present) turn.present = present
  const at = parseAt(row.at)
  if (at) turn.at = at
  return turn
}

/** 展示用：去掉已被结果卡覆盖的正文行，避免「同文案气泡 + 卡片」各画一遍。 */
function bubbleTextWithoutBlockDup(text, blocks) {
  const list = Array.isArray(blocks) ? blocks : []
  if (!list.length) return String(text || '').trim()
  const covered = {}
  function mark(s) {
    const t = String(s || '').trim()
    if (t) covered[t] = true
  }
  list.forEach((block) => {
    const blockTitle = String((block && block.title) || '').trim()
    mark(blockTitle)
    ;(Array.isArray(block && block.cards) ? block.cards : []).forEach((card) => {
      const title = String((card && card.title) || '').trim()
      const subtitle = String((card && card.subtitle) || '').trim()
      mark(title)
      mark(subtitle)
      if (title && subtitle) mark(`${title}：${subtitle}`)
      if (blockTitle && title) mark(`${blockTitle}：${title}`)
      if (blockTitle && title && subtitle) mark(`${blockTitle}：${title}：${subtitle}`)
      ;(Array.isArray(card && card.facts) ? card.facts : []).forEach(mark)
    })
  })
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !covered[l])
    .join('\n')
}

/** 可持久化轮次（排除问候与 pending）；含助手 blocks 快照 */
function extractTurns(messages) {
  const out = []
  ;(messages || []).forEach((row) => {
    if (!row || row.kind === 'hello' || row.kind === 'pending') return
    const turn = normalizeTurn(row)
    if (turn) out.push(turn)
  })
  return truncatePreferReceipts(out, HISTORY_LIMIT)
}

function loadTurns(familyId) {
  const key = storageKey(familyId)
  if (!key) return []
  try {
    const raw = getStorage(key)
    const list = raw && Array.isArray(raw.turns) ? raw.turns : Array.isArray(raw) ? raw : []
    return extractTurns(list)
  } catch (e) {
    return []
  }
}

function saveTurns(familyId, messages) {
  const key = storageKey(familyId)
  if (!key) return []
  const turns = extractTurns(messages)
  try {
    setStorage(key, { turns, updatedAt: Date.now() })
  } catch (e) {
    // 存储满或不可用时忽略，不影响当次对话
  }
  return turns
}

function clearTurns(familyId) {
  const key = storageKey(familyId)
  if (!key) return
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    // ignore
  }
}

/** 冷启动恢复文字 + blocks + present；不恢复 confirm / chips / navLinks */
function turnsToMessages(turns, nextId) {
  const idFn = typeof nextId === 'function' ? nextId : () => `r${Math.random()}`
  return (turns || []).map((turn) => {
    const blocks = turn.role === 'assistant' ? sanitizeBlocks(turn.blocks) : []
    const present = turn.role === 'assistant' ? sanitizePresent(turn.present) : null
    const text = turn.text || ''
    let bubbleText = text
    if (turn.role === 'assistant') {
      bubbleText = bubbleTextWithoutBlockDup(text, blocks)
      if (present) bubbleText = bubbleTextWithoutPresentDup(bubbleText, present)
    }
    const msg = {
      id: idFn(),
      role: turn.role,
      kind: turn.role === 'user' ? 'user' : 'result',
      text,
      bubbleText,
      blocks,
      present,
      askList: [],
      confirmList: [],
      hasChips: false,
      subscribeItems: [],
      navLinks: []
    }
    return attachStoredTime(msg, turn.at)
  })
}

/**
 * 从 blocks 补全可能偏瘦的 assistant text（旧落盘缺块标题时也能进 history）。
 */
function textWithBlockSignals(turn) {
  const base = String((turn && turn.text) || '').trim()
  const blocks = (turn && turn.blocks) || []
  if (!blocks.length) return base
  const extras = []
  blocks.forEach((block) => {
    const blockTitle = String((block && block.title) || '').trim()
    if (!blockTitle) return
    const cardBits = (block.cards || [])
      .map((card) => {
        const title = String((card && card.title) || '').trim()
        const subtitle = String((card && card.subtitle) || '').trim()
        if (!title) return ''
        return subtitle ? `${title}：${subtitle}` : title
      })
      .filter(Boolean)
    const line = cardBits.length ? `${blockTitle}：${cardBits.join('；')}` : blockTitle
    if (line && base.indexOf(blockTitle) < 0) extras.push(line)
  })
  if (!extras.length) return base
  return [base, ...extras].filter(Boolean).join('\n').slice(0, TEXT_MAX)
}

/**
 * 只送模型短文本，不带 blocks 结构；语义须已摊进 text（含块标题如「可能重复」）。
 * 对仍带 blocks 的旧落盘，用块标题回填，避免 history 丢 UI 信号。
 * 长度与 TEXT_MAX / 服务端 sanitize 对齐。
 */
function historyFromMessages(messages) {
  return extractTurns(messages).map((row) => {
    const out = {
      role: row.role,
      text: textWithBlockSignals(row).slice(0, TEXT_MAX)
    }
    if (row.at) out.at = String(row.at)
    return out
  })
}

module.exports = {
  HISTORY_LIMIT,
  extractTurns,
  loadTurns,
  saveTurns,
  clearTurns,
  turnsToMessages,
  historyFromMessages,
  bubbleTextWithoutBlockDup,
  truncatePreferReceipts,
  isQtyReceiptText,
  formatBubbleTime,
  stampMessage,
  attachStoredTime,
  parseAt
}
