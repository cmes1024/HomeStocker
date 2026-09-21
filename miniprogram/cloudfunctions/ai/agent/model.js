const { ASSIST_PROMPT_ID, ASSIST_PROMPT_VERSION, ASSIST_PROMPT_V2 } = require('../promptAssist')
const { parsePlan } = require('./plan')
const { renderFocus } = require('./refs')

async function ensureAssistPrompt(db) {
  const ref = db.collection('aiPrompts').doc(ASSIST_PROMPT_ID)
  const snap = await ref.get().catch(() => null)
  if (snap && snap.data && snap.data.system && Number(snap.data.version) >= ASSIST_PROMPT_VERSION) {
    return { _id: ASSIST_PROMPT_ID, ...snap.data }
  }
  const doc = {
    version: ASSIST_PROMPT_VERSION,
    system: ASSIST_PROMPT_V2,
    updatedAt: Date.now()
  }
  await ref.set({ data: doc })
  return { _id: ASSIST_PROMPT_ID, ...doc }
}

const HISTORY_LIMIT = 20

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : ''
    if (!role) continue
    const text = String(row.text || row.content || '').trim().slice(0, 200)
    if (!text) continue
    out.push({ role, text })
  }
  return out.slice(-HISTORY_LIMIT)
}

function renderHistory(rows) {
  if (!rows || !rows.length) return '无'
  return rows
    .map((row) => `${row.role === 'user' ? '家人' : '助手'}：${row.text}`)
    .join('\n')
}

function sanitizeRecentIds(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = {}
  for (let i = 0; i < raw.length && out.length < 6; i++) {
    const id = String(raw[i] || '').trim()
    if (!id || id.length > 64 || seen[id]) continue
    seen[id] = true
    out.push(id)
  }
  return out
}

function sanitizeRecentMeta(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = {}
  for (let i = 0; i < raw.length && out.length < 6; i++) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const itemId = String(row.itemId || row._id || '').trim()
    if (!itemId || itemId.length > 64 || seen[itemId]) continue
    seen[itemId] = true
    const entry = { itemId, name: String(row.name || '').trim().slice(0, 40) }
    const op = String(row.op || '').trim()
    if (op === 'create' || op === 'update') entry.op = op
    if (row.quantityBefore != null && row.quantityBefore !== '') {
      entry.quantityBefore = row.quantityBefore
    }
    if (row.quantityAfter != null && row.quantityAfter !== '') {
      entry.quantityAfter = row.quantityAfter
    }
    out.push(entry)
  }
  return out
}

function renderProbe(rows) {
  if (!rows || !rows.length) return '无'
  return rows.map((row) => renderFocus(row)).join('\n')
}

function fillAssistPrompt(system, vars) {
  return String(system || '')
    .replace(/\{\{TODAY\}\}/g, vars.today || '')
    .replace(/\{\{WEEKDAY\}\}/g, vars.weekday || '')
    .replace(/\{\{FAMILY_NAME\}\}/g, vars.familyName || '家庭')
    .replace(/\{\{CAPABILITIES\}\}/g, vars.capabilities || '')
    .replace(/\{\{TREE\}\}/g, vars.tree || '')
    .replace(/\{\{FOCUS\}\}/g, vars.focus || '无')
    .replace(/\{\{PROBE\}\}/g, vars.probe || '无')
    .replace(/\{\{HISTORY\}\}/g, vars.history || '无')
    .replace(/\{\{EXEC\}\}/g, vars.exec || '无')
    .replace(/\{\{KNOWLEDGE_INDEX\}\}/g, vars.knowledgeIndex || '无')
    .replace(/\{\{KNOWLEDGE\}\}/g, vars.knowledge || '无')
}

/** 仅根据执行回执拼场景文本，不做决策、不加查询 */
function renderExecReceipt(report, treeText) {
  const lines = []
  const executed = (report && report.executed) || []
  const failed = (report && report.failed) || []
  const pending = (report && report.pending) || []
  if (executed.length) {
    lines.push('已成功：')
    executed.forEach((row) => {
      lines.push(`- 第 ${row.step} 步 ${row.use}：${row.summary || '完成'}`)
    })
  } else {
    lines.push('已成功：无')
  }
  if (failed.length) {
    lines.push('已失败：')
    failed.forEach((row) => {
      lines.push(`- 第 ${row.step} 步 ${row.use}：${row.summary || '失败'}`)
      if (row.call) {
        try {
          lines.push(`  原调用：${JSON.stringify(row.call)}`)
        } catch (e) {
          // ignore
        }
      }
    })
  } else {
    lines.push('已失败：无')
  }
  if (pending.length) {
    lines.push('尚未执行（请重编排；勿重复已成功步骤）：')
    pending.forEach((call) => {
      try {
        lines.push(`- ${JSON.stringify(call)}`)
      } catch (e) {
        lines.push(`- ${call && call.use}`)
      }
    })
  } else {
    lines.push('尚未执行：无')
  }
  lines.push('当前家庭结构：')
  lines.push(treeText || '无')
  return lines.join('\n')
}

function providerErrorBody(err) {
  const data = err && err.response && err.response.data
  if (!data) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data)
  } catch (e) {
    return String(data)
  }
}

/** DeepSeek 402 / 余额类错误 → 明确提示；其余保持通用文案 */
function classifyModelError(err) {
  const status = (err && err.response && err.response.status) || 0
  const blob = `${err && err.message ? err.message : ''} ${providerErrorBody(err)}`
  if (
    status === 402 ||
    /insufficient\s*balance|余额不足|quota\s*exceeded|额度不足|余额不够/i.test(blob)
  ) {
    return {
      code: 'AI_QUOTA',
      message: '家庭 AI 额度可能已用完，请检查密钥余额或更换密钥'
    }
  }
  return {
    code: 'ACT_FAILED',
    message: '助手暂时不可用，请稍后重试'
  }
}

async function askModel(deps, system, userText) {
  const { callDeepSeek, keys, timeout, maxTokens } = deps
  const tryKeys = (keys || []).slice(0, 2)
  let lastCode = 'ACT_FAILED'
  let lastMessage = '助手暂时不可用，请稍后重试'
  let sawQuota = false
  let lastContent = ''
  // 调试：云函数日志里完整打印发给模型的内容（密钥不落日志）
  console.info('[ai.act] >>> system\n' + String(system || ''))
  console.info('[ai.act] >>> user\n' + String(userText || ''))
  for (let i = 0; i < tryKeys.length; i++) {
    const key = tryKeys[i]
    try {
      const result = await callDeepSeek(key.apiKey, system, userText, {
        timeout,
        maxTokens
      })
      lastContent = result.content
      console.info('[ai.act] <<< model\n' + String(result.content || ''))
      return {
        plan: parsePlan(result.content),
        turn: {
          system: String(system || ''),
          user: String(userText || ''),
          model: String(result.content || '')
        }
      }
    } catch (err) {
      const classified = classifyModelError(err)
      lastCode = classified.code
      lastMessage = classified.message
      if (classified.code === 'AI_QUOTA') sawQuota = true
      const retryable = err.retryable === true || typeof err.retryable === 'undefined'
      if (!retryable) {
        throw Object.assign(new Error(lastMessage), { code: lastCode })
      }
    }
  }
  if (lastContent) {
    try {
      return {
        plan: parsePlan(lastContent),
        turn: {
          system: String(system || ''),
          user: String(userText || ''),
          model: String(lastContent || '')
        }
      }
    } catch (e) {
      // fall through
    }
  }
  if (sawQuota) {
    throw Object.assign(
      new Error('家庭 AI 额度可能已用完，请检查密钥余额或更换密钥'),
      { code: 'AI_QUOTA' }
    )
  }
  throw Object.assign(new Error(lastMessage), { code: lastCode })
}

module.exports = {
  ensureAssistPrompt,
  sanitizeHistory,
  renderHistory,
  sanitizeRecentIds,
  sanitizeRecentMeta,
  renderProbe,
  renderExecReceipt,
  fillAssistPrompt,
  askModel,
  ASSIST_PROMPT_V2
}
