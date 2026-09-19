const { getStorage, setStorage } = require('../../utils/storage')

const HISTORY_LIMIT = 20
const TEXT_MAX = 500
const BLOCKS_MAX = 6
const CARDS_PER_BLOCK_MAX = 12
const KEY_PREFIX = 'assist_transcript_'

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
  return out.slice(-HISTORY_LIMIT)
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

/** 冷启动恢复文字 + blocks；不恢复 confirm / chips */
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
      subscribeItems: []
    }
  })
}

/** 只送模型短文本，不带 blocks */
function historyFromMessages(messages) {
  return extractTurns(messages).map((row) => ({
    role: row.role,
    text: String(row.text || '').slice(0, 200)
  }))
}

module.exports = {
  HISTORY_LIMIT,
  extractTurns,
  loadTurns,
  saveTurns,
  clearTurns,
  turnsToMessages,
  historyFromMessages
}
