const { isHardDenied } = require('../capabilities')
const { buildExecutionPresentation } = require('../agent/presentation')
const { publicRecentItems } = require('../agent/refs')
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
  require('./knowledgeGet')
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
  ;['name', 'spaceName', 'locationName', 'quantity', 'unit', 'ref', 'note', 'topicId'].forEach((k) => {
    if (call[k] != null && call[k] !== '') row[k] = call[k]
  })
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
  const recentItems = []
  const removedItemIds = []
  const createdPlaces = []
  let wrote = false
  let subscribeItems = null
  let subscribeUi = false
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
    recentItems.push(entry)
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
      if (result.ui) executedRow.ui = result.ui
      if (result.subscribeItems) {
        executedRow.subscribeItems = result.subscribeItems
        subscribeItems = result.subscribeItems
        if (result.ui === 'subscribePanel') subscribeUi = true
      }
      executed.push(executedRow)

      if (result.wrote) wrote = true
      if (result.remember) remember(result.remember)
      if (Array.isArray(result.removedItemIds)) {
        result.removedItemIds.forEach((id) => {
          if (id) removedItemIds.push(id)
        })
      }
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

  // 结构写过：收尾从 DB 重建一次，供同轮 replan / 下一轮上下文（中途只用内存 patch）
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

  return {
    executed: executed.map((row) => ({
      step: row.step,
      use: row.use,
      summary: row.summary,
      ui: row.ui,
      subscribeItems: row.subscribeItems,
      inventory: row.inventory,
      knowledge: row.knowledge
    })),
    failed,
    pending,
    createClassFailed: failed.some((f) => f.createClass),
    possibleDuplicates,
    lines,
    lead: presentation.lead,
    blocks: presentation.blocks,
    recentItems: publicRecentItems(recentItems),
    removedItemIds,
    wrote:
      wrote ||
      executed.some((row) =>
        /item\.create|item\.createMany|item\.update|item\.remove|item\.removeMany|item\.merge|space\.create|space\.createMany|space\.createLocation|space\.createLocationMany|space\.remove|space\.removeMany|space\.removeLocation|space\.removeLocationMany|tag\.create|tag\.createMany|tag\.remove|tag\.removeMany/.test(
          row.use
        )
      ),
    subscribeUi,
    subscribeItems: subscribeItems || [],
    tree: ctx.tree
  }
}

module.exports = {
  HANDLER_MAP,
  runAll,
  isCreateClassUse,
  compactCall
}
