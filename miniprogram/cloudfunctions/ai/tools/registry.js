const { isHardDenied } = require('../capabilities')
const { buildExecutionPresentation } = require('../agent/presentation')
const { flushFamilyTreeIfDirty } = require('../familyTree')
const { findDuplicates } = require('./helpers')

const HANDLERS = [
  require('./itemSearch'),
  require('./itemListExpiring'),
  require('./itemCreate'),
  require('./itemCreateMany'),
  require('./itemUpdate'),
  require('./itemRemove'),
  require('./itemRemoveMany'),
  require('./itemMerge'),
  require('./spaceCreate'),
  require('./spaceCreateMany'),
  require('./spaceCreateLocation'),
  require('./spaceCreateLocationMany'),
  require('./spaceRemove'),
  require('./spaceRemoveMany'),
  require('./spaceRemoveLocation'),
  require('./spaceRemoveLocationMany'),
  require('./tagCreate'),
  require('./tagCreateMany'),
  require('./tagRemove'),
  require('./tagRemoveMany'),
  require('./itemExpireSubscribePanel'),
  require('./knowledgeGet'),
  require('./pageGet')
]

const HANDLER_MAP = {}
HANDLERS.forEach((h) => {
  if (h && h.id) HANDLER_MAP[h.id] = h
})

/** 创建类写：失败后可由模型重编排（代码不做降级决策） */
function isCreateClassUse(use) {
  return /^(item\.create|item\.createMany|space\.create|space\.createMany|space\.createLocation|space\.createLocationMany|tag\.create|tag\.createMany)$/.test(
    String(use || '').trim()
  )
}

function compactCall(call) {
  if (!call || typeof call !== 'object') return null
  const use = String(call.use || '').trim()
  if (!use) return null
  const row = { use }
  ;[
    'name',
    'spaceName',
    'locationName',
    'quantity',
    'unit',
    'ref',
    'note',
    'topicId',
    'pageId',
    'label',
    'open'
  ].forEach((k) => {
    if (call[k] != null && call[k] !== '') row[k] = call[k]
  })
  if (call.query && typeof call.query === 'object' && !Array.isArray(call.query)) {
    row.query = call.query
  }
  if (Array.isArray(call.items) && call.items.length) {
    row.items = call.items.slice(0, 20).map((it) => {
      if (!it || typeof it !== 'object') return it
      const o = {}
      ;['name', 'spaceName', 'locationName', 'quantity', 'unit'].forEach((k) => {
        if (it[k] != null && it[k] !== '') o[k] = it[k]
      })
      return o
    })
  }
  if (Array.isArray(call.spaces) && call.spaces.length) {
    row.spaces = call.spaces.slice(0, 20).map((s) => ({
      name: (s && (s.name || s.spaceName)) || ''
    }))
  }
  if (Array.isArray(call.locations) && call.locations.length) {
    row.locations = call.locations.slice(0, 20).map((l) => ({
      spaceName: (l && l.spaceName) || '',
      locationName: (l && (l.locationName || l.name)) || ''
    }))
  }
  if (Array.isArray(call.refs) && call.refs.length) {
    row.refs = call.refs.slice(0, 20).map((r) => String(r || '').trim()).filter(Boolean)
  }
  if (Array.isArray(call.names) && call.names.length) {
    row.names = call.names.slice(0, 20).map((n) => String(n || '').trim()).filter(Boolean)
  }
  if (Array.isArray(call.tags) && call.tags.length) {
    row.tags = call.tags.slice(0, 20).map((t) => {
      if (t == null) return t
      if (typeof t === 'string') return { name: t }
      return { name: String((t && (t.name || t.tagName)) || '').trim() }
    })
  }
  return row
}

function compactTouched(rows) {
  const out = []
  const seen = {}
  ;(rows || []).forEach((row) => {
    const itemId = row && (row.itemId || row._id)
    if (!itemId || seen[itemId]) return
    seen[itemId] = true
    const entry = { itemId, name: row.name || '' }
    const op = String((row && row.op) || '').trim()
    if (op) entry.op = op
    if (row.quantityBefore != null && row.quantityBefore !== '') {
      entry.quantityBefore = row.quantityBefore
    }
    if (row.quantityAfter != null && row.quantityAfter !== '') {
      entry.quantityAfter = row.quantityAfter
    }
    out.push(entry)
  })
  return out.slice(0, 12)
}

/**
 * Run plan calls sequentially through enabled ∩ ¬hardDeny handlers.
 * Stop on first failure; keep earlier successes.
 * Returns pending = calls not run after the failure (for model replan).
 * Code only executes and reports; no degrade decisions here.
 */
async function runAll(ctx, calls) {
  const catalogMap = ctx.catalogMap || {}
  const executed = []
  const failed = []
  const pending = []
  const touched = []
  const createdPlaces = []
  let wrote = false
  let subscribeItems = null
  let subscribeUi = false
  const navLinks = []
  let stoppedAt = -1

  function remember(row) {
    if (!row) return
    if (Array.isArray(row)) {
      row.forEach(remember)
      return
    }
    const itemId = row.itemId || row._id
    if (!itemId) return
    const entry = {
      itemId,
      name: row.name || ''
    }
    const op = String(row.op || '').trim()
    if (op) entry.op = op
    if (row.quantityBefore != null && row.quantityBefore !== '') {
      entry.quantityBefore = row.quantityBefore
    }
    if (row.quantityAfter != null && row.quantityAfter !== '') {
      entry.quantityAfter = row.quantityAfter
    }
    touched.push(entry)
  }

  for (let i = 0; i < (calls || []).length; i++) {
    const call = calls[i] || {}
    const use = String(call.use || '').trim()
    const step = i + 1

    if (!use || isHardDenied(use) || !catalogMap[use] || !HANDLER_MAP[use]) {
      failed.push({
        step,
        use: use || 'unknown',
        summary: `第 ${step} 步不能执行${use ? `（${use}）` : ''}`,
        createClass: isCreateClassUse(use)
      })
      stoppedAt = i
      break
    }

    try {
      const result = await HANDLER_MAP[use].run(ctx, call, step)
      if (!result || !result.ok) {
        failed.push({
          step,
          use,
          summary: (result && result.summary) || `第 ${step} 步失败`,
          createClass: isCreateClassUse(use),
          call: compactCall(call)
        })
        stoppedAt = i
        break
      }

      const executedRow = {
        step,
        use,
        summary: result.summary
      }
      if (Array.isArray(result.inventory)) {
        executedRow.inventory = result.inventory
      }
      if (result.knowledge) executedRow.knowledge = result.knowledge
      if (result.pageDoc) executedRow.pageDoc = result.pageDoc
      if (result.pages) executedRow.pages = result.pages
      if (result.page) executedRow.page = result.page
      if (result.ui) executedRow.ui = result.ui
      if (result.subscribeItems) {
        executedRow.subscribeItems = result.subscribeItems
        subscribeItems = result.subscribeItems
        if (result.ui === 'subscribePanel') subscribeUi = true
      }
      if (result.ui === 'navLinks' && Array.isArray(result.navLinks)) {
        executedRow.navLinks = result.navLinks
        result.navLinks.forEach((link) => {
          if (link && link.url) navLinks.push(link)
        })
      }
      executed.push(executedRow)

      if (result.wrote) wrote = true
      if (result.remember) remember(result.remember)
      if (result.duplicateCheck) {
        createdPlaces.push(result.duplicateCheck)
      }
    } catch (e) {
      failed.push({
        step,
        use,
        summary: `第 ${step} 步失败：${e.message || String(e)}`,
        createClass: isCreateClassUse(use),
        call: compactCall(call)
      })
      stoppedAt = i
      break
    }
  }

  if (stoppedAt >= 0 && calls && calls.length) {
    for (let j = stoppedAt + 1; j < calls.length; j++) {
      const c = compactCall(calls[j])
      if (c) pending.push(c)
    }
  }

  await flushFamilyTreeIfDirty(ctx)

  const possibleDuplicates = []
  for (let i = 0; i < createdPlaces.length; i++) {
    const row = createdPlaces[i]
    const hits = await findDuplicates(
      ctx.db,
      ctx.familyId,
      row.spaceId,
      row.locationId,
      row.name
    )
    if (hits.length >= 2) {
      possibleDuplicates.push({
        name: row.name,
        spaceName: row.spaceName,
        locationName: row.locationName,
        count: hits.length
      })
    }
  }

  const presentation = buildExecutionPresentation(
    executed,
    failed,
    possibleDuplicates,
    ctx.tree
  )
  const lines =
    presentation.lines && presentation.lines.length
      ? presentation.lines
      : ['没有需要执行的操作']

  if (subscribeUi && executed.some((r) => r.ui === 'subscribePanel')) {
    const sub = executed.find((r) => r.ui === 'subscribePanel')
    if (sub && sub.summary) {
      presentation.lead = sub.summary
    }
  }

  if (navLinks.length && !presentation.lead) {
    presentation.lead =
      navLinks.length === 1
        ? navLinks[0].label || '可以点下面直达'
        : '可以点下面直达相关页面'
  }

  return {
    executed: executed.map((row) => ({
      step: row.step,
      use: row.use,
      summary: row.summary,
      ui: row.ui,
      subscribeItems: row.subscribeItems,
      navLinks: row.navLinks,
      inventory: row.inventory,
      knowledge: row.knowledge,
      pageDoc: row.pageDoc,
      pages: row.pages,
      page: row.page
    })),
    failed,
    pending,
    createClassFailed: failed.some((f) => f.createClass),
    possibleDuplicates,
    lines,
    lead: presentation.lead,
    blocks: presentation.blocks,
    /** 本轮刚写入摘要（仅同轮确认文案用，不回传客户端） */
    touched: compactTouched(touched),
    wrote:
      wrote ||
      executed.some((row) =>
        /item\.create|item\.createMany|item\.update|item\.remove|item\.removeMany|item\.merge|space\.create|space\.createMany|space\.createLocation|space\.createLocationMany|space\.remove|space\.removeMany|space\.removeLocation|space\.removeLocationMany|tag\.create|tag\.createMany|tag\.remove|tag\.removeMany/.test(
          row.use
        )
      ),
    subscribeUi,
    subscribeItems: subscribeItems || [],
    navLinks,
    tree: ctx.tree
  }
}

module.exports = {
  HANDLER_MAP,
  runAll,
  isCreateClassUse,
  compactCall
}
