/**
 * 助手知识包注册表（代码源；未来可改为读 aiKnowledge 集合）。
 * 正文禁止默认进 prompt；只暴露目录，按 topic 渐进 get。
 */
const PACKS = [require('./capacity')]

const BY_ID = {}
PACKS.forEach((p) => {
  if (p && p.topicId) BY_ID[p.topicId] = p
})

const MAX_GETS_PER_ACT = 3

function listEnabled() {
  return PACKS.filter((p) => p && p.enabled !== false && p.topicId)
}

/** 短目录：给 system prompt，禁止含 body */
function renderIndex() {
  const rows = listEnabled()
  if (!rows.length) return '无'
  return rows
    .map((p) => `- ${p.topicId}：${p.summary || p.title || ''}`)
    .join('\n')
}

function getPack(topicId) {
  const id = String(topicId || '').trim()
  if (!id) return null
  const pack = BY_ID[id]
  if (!pack || pack.enabled === false) return null
  return pack
}

/**
 * 取单个 topic 正文（可附 liveFacts 行）。
 * @returns {{ topicId, title, version, body, text } | null}
 */
function loadTopic(topicId, liveFacts) {
  const pack = getPack(topicId)
  if (!pack) return null
  const facts = Array.isArray(liveFacts)
    ? liveFacts.filter((l) => l && String(l).trim())
    : liveFacts
      ? [String(liveFacts)]
      : []
  const parts = [pack.body]
  if (facts.length) {
    parts.push('')
    parts.push('【当前家庭】')
    facts.forEach((l) => parts.push(String(l)))
  }
  const body = parts.join('\n')
  return {
    topicId: pack.topicId,
    title: pack.title || pack.topicId,
    version: pack.version || 1,
    body,
    text: `${pack.title || pack.topicId}\n${body}`
  }
}

module.exports = {
  PACKS,
  MAX_GETS_PER_ACT,
  listEnabled,
  renderIndex,
  getPack,
  loadTopic
}
