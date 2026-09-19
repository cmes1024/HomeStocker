const { CAPABILITY_LIMIT_ASK, OUT_OF_SCOPE_ASK } = require('../promptAssist')

const BOUNDARY_ASKS = new Set([CAPABILITY_LIMIT_ASK, OUT_OF_SCOPE_ASK])

function optionChoice(label, value) {
  const l = String(label || '').trim()
  const v = String(value || '').trim()
  if (!l && !v) return null
  const useLabel = l || v
  const machine = /^[a-z][a-z0-9_-]*$/i.test(v) && v.length <= 32
  return { label: useLabel, value: machine || !v ? useLabel : v }
}

function normalizeAsk(raw) {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .map((item) => {
      if (item == null || item === '') return null
      if (typeof item === 'string') {
        const question = item.trim()
        return question ? { question, options: [] } : null
      }
      const question = String(item.question || item.text || item.prompt || '').trim()
      if (!question) return null
      const options = Array.isArray(item.options)
        ? item.options
            .map((opt) => {
              if (opt == null) return null
              if (typeof opt === 'string') {
                return optionChoice(opt, opt)
              }
              return optionChoice(opt.label || opt.value, opt.value || opt.label)
            })
            .filter(Boolean)
        : []
      return { question, options }
    })
    .filter(Boolean)
}

function normalizeProbe(raw) {
  if (!raw || typeof raw !== 'object') return null
  const spaceName = String(raw.spaceName || '').trim()
  const locationName = String(raw.locationName || '').trim()
  const name = String(raw.name || '').trim()
  // list:true / scope:family = 扫当前家庭物资（品类/全家问）；允许无地点
  const listAll = raw.list === true || String(raw.scope || '').trim() === 'family'
  if (!spaceName && !locationName && !name && !listAll) return null
  return { spaceName, locationName, name, listAll: !!listAll }
}

function normalizeReply(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  return text.slice(0, 800)
}

/**
 * 模型偶发把拒答固定话术放进 reply：改回 ask，保证页面走澄清气泡而不是普通回复。
 */
function coerceBoundaryReplyToAsk(plan) {
  if (!plan || plan.ask.length || plan.calls.length || plan.probe) return plan
  const reply = String(plan.reply || '').trim()
  if (!BOUNDARY_ASKS.has(reply)) return plan
  return {
    ...plan,
    ask: [{ question: reply, options: [] }],
    reply: ''
  }
}

function parsePlan(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid plan shape')
  }
  const ask = normalizeAsk(parsed.ask)
  const probe = normalizeProbe(parsed.probe)
  const calls = Array.isArray(parsed.calls)
    ? parsed.calls.filter((c) => c && typeof c === 'object')
    : []
  let reply = normalizeReply(parsed.reply || parsed.answer || parsed.message)
  // ask / calls 优先：有澄清或要执行时丢掉 reply，避免双通道
  if (ask.length || calls.length) reply = ''
  return coerceBoundaryReplyToAsk({ ask, probe, calls, reply })
}

function draftFromCalls(calls) {
  const many = (calls || []).find((c) => c && c.use === 'item.createMany')
  if (many && Array.isArray(many.items) && many.items[0]) {
    const first = many.items[0] || {}
    return {
      name: String(first.name || '').trim(),
      quantity: first.quantity,
      unit: String(first.unit || '').trim(),
      note: String(first.note || '').trim(),
      spaceName: String(first.spaceName || '').trim(),
      locationName: String(first.locationName || '').trim(),
      expireDate: first.expireDate || '',
      productionDate: first.productionDate || ''
    }
  }
  const create =
    (calls || []).find((c) => c && c.use === 'item.create') || (calls || [])[0] || {}
  return {
    name: String(create.name || '').trim(),
    quantity: create.quantity,
    unit: String(create.unit || '').trim(),
    note: String(create.note || '').trim(),
    spaceName: String(create.spaceName || '').trim(),
    locationName: String(create.locationName || '').trim(),
    expireDate: create.expireDate || '',
    productionDate: create.productionDate || ''
  }
}

module.exports = {
  optionChoice,
  normalizeAsk,
  normalizeProbe,
  normalizeReply,
  coerceBoundaryReplyToAsk,
  parsePlan,
  draftFromCalls
}
