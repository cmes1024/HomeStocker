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

function normalizeTurn(row) {
  if (!row || typeof row !== 'object') return null
  const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : ''
  if (!role) return null
  const text = String(row.text || '').trim().slice(0, TEXT_MAX)
  const blocks = role === 'assistant' ? sanitizeBlocks(row.blocks) : []
  if (!text && !blocks.length) return null
  const turn = { role, text: text || (blocks.length ? '完成' : '') }
  if (blocks.length) turn.blocks = blocks
  return turn
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

/** 冷启动恢复文字 + blocks；不恢复 confirm / chips / navLinks */
function turnsToMessages(turns, nextId) {
  const idFn = typeof nextId === 'function' ? nextId : () => `r${Math.random()}`
  return (turns || []).map((turn) => {
    const blocks = turn.role === 'assistant' ? sanitizeBlocks(turn.blocks) : []
    return {
      id: idFn(),
      role: turn.role,
      kind: turn.role === 'user' ? 'user' : 'result',
      text: turn.text || '',
      blocks,
      askList: [],
      confirmList: [],
      hasChips: false,
      subscribeItems: [],
      navLinks: []
    }
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
  return extractTurns(messages).map((row) => ({
    role: row.role,
    text: textWithBlockSignals(row).slice(0, TEXT_MAX)
  }))
}

module.exports = {
  HISTORY_LIMIT,
  extractTurns,
  loadTurns,
  saveTurns,
  clearTurns,
  turnsToMessages,
  historyFromMessages,
  truncatePreferReceipts,
  isQtyReceiptText
}
