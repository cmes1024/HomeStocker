/**
 * 领域读的进程内存缓存。摘除缓存时删本文件，并把 cloud.js 改回直传即可。
 * 不依赖页面；key 含 familyId，切家时由 cloud.js 整表清空。
 * 条目带 expiresAt；过期视为未命中并删除。
 */

const SEP = '\x1f'

const store = new Map()
const inflight = new Map()

function stableSerialize(value) {
  if (value === undefined) return ''
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number' || t === 'boolean' || t === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort()
    const parts = []
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (value[k] === undefined) continue
      parts.push(`${JSON.stringify(k)}:${stableSerialize(value[k])}`)
    }
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(String(value))
}

function makeKey(familyId, name, action, params, extra) {
  return [String(familyId || ''), name, action, stableSerialize(params || {}), extra || ''].join(
    SEP
  )
}

function splitKey(key) {
  const parts = String(key).split(SEP)
  return {
    familyId: parts[0] || '',
    name: parts[1] || '',
    action: parts[2] || ''
  }
}

function isFresh(entry) {
  if (!entry) return false
  const exp = Number(entry.expiresAt)
  if (!Number.isFinite(exp)) return true
  return Date.now() < exp
}

function get(key) {
  if (!store.has(key)) return undefined
  const entry = store.get(key)
  if (!isFresh(entry)) {
    store.delete(key)
    return undefined
  }
  return entry.value
}

function has(key) {
  return get(key) !== undefined
}

/**
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlMs] 毫秒；缺省或非正数则不过期（仍可被 invalidate / clearAll 清掉）
 */
function set(key, value, ttlMs) {
  const ms = Number(ttlMs)
  const expiresAt =
    Number.isFinite(ms) && ms > 0 ? Date.now() + ms : Number.POSITIVE_INFINITY
  store.set(key, { value, expiresAt })
}

function getInflight(key) {
  return inflight.get(key)
}

function setInflight(key, promise) {
  inflight.set(key, promise)
}

function clearInflight(key) {
  inflight.delete(key)
}

function dropBy(predicate) {
  const keys = []
  store.forEach((_value, key) => {
    if (predicate(key, splitKey(key))) keys.push(key)
  })
  keys.forEach((key) => store.delete(key))
}

function dropByName(name) {
  dropBy((_key, parts) => parts.name === name)
}

function dropNameAction(name, action) {
  dropBy((_key, parts) => parts.name === name && parts.action === action)
}

function clearAll() {
  store.clear()
  inflight.clear()
}

module.exports = {
  makeKey,
  get,
  has,
  set,
  getInflight,
  setInflight,
  clearInflight,
  dropByName,
  dropNameAction,
  clearAll
}
