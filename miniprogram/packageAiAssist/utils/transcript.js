const { getStorage, setStorage } = require('../../utils/storage')

const HISTORY_LIMIT = 20
const TEXT_MAX = 500
const KEY_PREFIX = 'assist_transcript_'

function storageKey(familyId) {
  const id = String(familyId || '').trim()
  return id ? `${KEY_PREFIX}${id}` : ''
}

function normalizeTurn(row) {
  if (!row || typeof row !== 'object') return null
  const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : ''
  if (!role) return null
  const text = String(row.text || '').trim().slice(0, TEXT_MAX)
  if (!text) return null
  return { role, text }
}

/** 可持久化 / 可送模型的文字轮次（排除问候与 pending） */
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

/** 冷启动只恢复文字气泡，无 confirm / chips / blocks */
function turnsToMessages(turns, nextId) {
  const idFn = typeof nextId === 'function' ? nextId : () => `r${Math.random()}`
  return (turns || []).map((turn) => ({
    id: idFn(),
    role: turn.role,
    kind: turn.role === 'user' ? 'user' : 'result',
    text: turn.text,
    askList: [],
    confirmList: [],
    hasChips: false,
    subscribeItems: []
  }))
}

function historyFromMessages(messages) {
  return extractTurns(messages).map((row) => ({
    role: row.role,
    text: String(row.text).slice(0, 200)
  }))
}

module.exports = {
  HISTORY_LIMIT,
  extractTurns,
  loadTurns,
  saveTurns,
  turnsToMessages,
  historyFromMessages
}
