const { placeLabel } = require('./treeMatch')

const REPLY_CARD_LIMIT = 8

/** 解析物资展示用地点 / 标签（有值才返回） */
function resolveItemDisplay(item, tree) {
  const spaces = (tree && tree.spaces) || []
  const space =
    spaces.find((s) => s && s.id === item.spaceId) ||
    spaces.find((s) => s && s.name === item.spaceName)
  const loc =
    (space && (space.locations || []).find((l) => l && l.id === item.locationId)) ||
    (space && (space.locations || []).find((l) => l && l.name === item.locationName))
  const spaceName = (space && space.name) || item.spaceName || ''
  const locationName = (loc && loc.name) || item.locationName || ''
  const place = [spaceName, locationName].filter(Boolean).join('/')
  const tagNames = []
  const tags = (tree && tree.tags) || []
  ;(item.tagIds || []).forEach((id) => {
    const hit = tags.find((t) => t && t.id === id)
    if (hit && hit.name) tagNames.push(hit.name)
  })
  let subtitle = ''
  if (item.quantity != null && item.quantity !== '') {
    subtitle = `${item.quantity}${item.unit ? item.unit : ''}`
  }
  const facts = []
  if (place) facts.push(place)
  if (item.expireDate) facts.push(`过期 ${item.expireDate}`)
  if (item.note) facts.push(String(item.note))
  return {
    title: item.name || '未命名',
    subtitle,
    facts,
    tags: tagNames,
    itemId: item._id || item.itemId || ''
  }
}

function buildItemCard(item, tree) {
  const d = resolveItemDisplay(item, tree)
  const card = { title: d.title }
  if (d.subtitle) card.subtitle = d.subtitle
  if (d.facts.length) card.facts = d.facts
  if (d.tags.length) card.tags = d.tags
  if (d.itemId) card.itemId = d.itemId
  return card
}

function cardToCompactLine(card) {
  const bits = [card.title]
  if (card.subtitle) bits.push(card.subtitle)
  ;(card.facts || []).forEach((f) => bits.push(f))
  return bits.join(' · ')
}

/** 查库 / 临期列表 → lead + blocks（代码拼，不经模型润色） */
function buildInventoryPresentation(list, tree, prefix, emptyText) {
  const rows = list || []
  const label = prefix || '查询'
  if (!rows.length) {
    const lead = emptyText || `${label}：没有找到匹配的物品`
    return { lead, blocks: [], lines: [lead] }
  }
  const cards = rows.slice(0, REPLY_CARD_LIMIT).map((item) => buildItemCard(item, tree))
  const footer =
    rows.length > REPLY_CARD_LIMIT ? `另有 ${rows.length - REPLY_CARD_LIMIT} 件未展开` : ''
  const block = { cards }
  if (footer) block.footer = footer
  const lead = `${label}：找到 ${rows.length} 件`
  const lines = [lead].concat(cards.map(cardToCompactLine))
  if (footer) lines.push(footer)
  return { lead, blocks: [block], lines }
}

/** 兼容旧调用：返回紧凑纯文本（有 blocks 时作兜底） */
function formatSearchReport(list, tree, prefix) {
  return buildInventoryPresentation(list, tree, prefix).lines.join('\n')
}

function buildDuplicateCards(possibleDuplicates) {
  return (possibleDuplicates || []).map((d) => {
    const place = placeLabel(d.spaceName, d.locationName)
    const card = {
      title: d.name || '物资',
      tone: 'warn'
    }
    const bits = []
    if (place) bits.push(place)
    if (d.count != null) bits.push(`${d.count} 条`)
    if (bits.length) card.subtitle = bits.join(' · ')
    return card
  })
}

/** 把「已改 大米（厨房）：4→5」拆成标题+副标题，卡片更好扫 */
function actionCardFromSummary(summary, tone) {
  const text = String(summary || '').trim()
  if (!text) return null
  const m = /^(已改|已记下|已删掉|已修改)\s+(.+?)：(.+)$/.exec(text)
  if (m) {
    return {
      title: `${m[1]} ${m[2]}`.trim(),
      subtitle: m[3].trim(),
      tone: tone || 'ok'
    }
  }
  return { title: text, tone: tone || 'ok' }
}

/**
 * 执行结果 → lead + blocks。
 * executed 项可带 inventory[]（查库）；否则用 summary 做动作卡。
 */
function buildExecutionPresentation(executed, failed, possibleDuplicates, tree) {
  const exec = executed || []
  const fail = failed || []
  const dups = possibleDuplicates || []
  const blocks = []
  const actionCards = []
  let inventoryLead = ''
  let inventoryLines = []

  exec.forEach((row) => {
    if (row && Array.isArray(row.inventory)) {
      const prefix =
        row.use === 'item.listExpiring'
          ? '临期/过期'
          : row.inventoryPrefix || '查询'
      const emptyText =
        row.use === 'item.listExpiring' ? '没有临期或过期物品' : ''
      const inv = buildInventoryPresentation(row.inventory, tree, prefix, emptyText)
      if (!inventoryLead) inventoryLead = inv.lead
      inventoryLines = inventoryLines.concat(inv.lines)
      ;(inv.blocks || []).forEach((b) => blocks.push(b))
      return
    }
    if (row && row.use === 'knowledge.get') {
      // 知识全文只给下一轮模型；气泡最多标题 + 用量短句，禁止 FAQ 墙
      const title =
        (row.knowledge && row.knowledge.title) ||
        String(row.summary || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)[0] ||
        '产品说明'
      const facts = String(row.summary || '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && s !== title)
        .slice(0, 3)
      if (!inventoryLead) inventoryLead = facts[0] || title
      facts.forEach((l) => inventoryLines.push(l))
      const card = { title }
      if (facts.length) card.facts = facts
      blocks.push({ cards: [card] })
      return
    }
    if (row && row.summary) {
      const card = actionCardFromSummary(row.summary, 'ok')
      if (card) actionCards.push(card)
    }
  })

  fail.forEach((row) => {
    if (row && row.summary) {
      const card = actionCardFromSummary(row.summary, 'error')
      if (card) actionCards.push(card)
    }
  })

  if (actionCards.length) {
    blocks.push({ cards: actionCards })
  }

  if (dups.length) {
    blocks.push({
      title: '可能重复（未合并）',
      tone: 'warn',
      cards: buildDuplicateCards(dups)
    })
  }

  const okCount = actionCards.filter((c) => c.tone === 'ok').length
  let lead = inventoryLead || ''
  if (!lead && okCount > 1) lead = `完成 ${okCount} 项`
  if (!lead && !blocks.length) lead = '没有需要执行的操作'

  const lines = []
  if (inventoryLines.length) {
    inventoryLines.forEach((l) => lines.push(l))
  }
  actionCards.forEach((c) => {
    const line = c.subtitle ? `${c.title}：${c.subtitle}` : c.title
    if (line) lines.push(line)
  })
  if (dups.length) {
    lines.push(
      '可能重复（未合并）：' +
        dups
          .map((d) => {
            const place = placeLabel(d.spaceName, d.locationName)
            return `${d.name}${place ? `（${place}）` : ''} ${d.count} 条`
          })
          .join('；')
    )
  }
  if (!lines.length && lead) lines.push(lead)

  return { lead, blocks, lines }
}

function attachPresentation(payload, presentation) {
  const p = presentation || { lead: '', blocks: [], lines: [] }
  const report = Object.assign({}, (payload && payload.report) || {}, {
    lead: p.lead || '',
    blocks: p.blocks || [],
    lines: p.lines && p.lines.length ? p.lines : (payload.report && payload.report.lines) || []
  })
  return Object.assign({}, payload, {
    lead: p.lead || '',
    blocks: p.blocks || [],
    report
  })
}

function textOnlyPresentation(text) {
  const lead = String(text || '').trim()
  return { lead, blocks: [], lines: lead ? [lead] : [] }
}

module.exports = {
  REPLY_CARD_LIMIT,
  resolveItemDisplay,
  buildItemCard,
  cardToCompactLine,
  buildInventoryPresentation,
  formatSearchReport,
  buildDuplicateCards,
  actionCardFromSummary,
  buildExecutionPresentation,
  attachPresentation,
  textOnlyPresentation
}
