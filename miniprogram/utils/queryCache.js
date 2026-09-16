/**
 * 云函数读的进程内存缓存。摘除缓存时删本文件，并把 cloud.js 改回直传即可。
 * 不依赖页面；key 含 familyId，切家时由 cloud.js 整表清空。
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

function get(key) {
  if (!store.has(key)) return undefined
  return store.get(key)
}

function has(key) {
  return store.has(key)
}

function set(key, value) {
  store.set(key, value)
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
