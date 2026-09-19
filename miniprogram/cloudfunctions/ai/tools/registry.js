const { isHardDenied } = require('../capabilities')
const { buildExecutionPresentation } = require('../agent/presentation')
const { publicRecentItems } = require('../agent/refs')
const { findDuplicates } = require('./helpers')

const HANDLERS = [
  require('./itemSearch'),
  require('./itemListExpiring'),
  require('./itemCreate'),
  require('./itemUpdate'),
  require('./itemRemove'),
  require('./itemMerge'),
  require('./spaceCreateLocation'),
  require('./itemExpireSubscribePanel')
]

const HANDLER_MAP = {}
HANDLERS.forEach((h) => {
  if (h && h.id) HANDLER_MAP[h.id] = h
})

/**
 * Run plan calls sequentially through enabled ∩ ¬hardDeny handlers.
 * Stop on first failure; keep earlier successes.
 */
async function runAll(ctx, calls) {
  const catalogMap = ctx.catalogMap || {}
  const executed = []
  const failed = []
  const recentItems = []
  const removedItemIds = []
  const createdPlaces = []
  let wrote = false
  let subscribeItems = null
  let subscribeUi = false

  function remember(row) {
    if (!row) return
    if (Array.isArray(row)) {
      row.forEach(remember)
      return
    }
    const itemId = row.itemId || row._id
    if (!itemId) return
    recentItems.push({
      itemId,
      name: row.name || ''
    })
  }

  for (let i = 0; i < (calls || []).length; i++) {
    const call = calls[i] || {}
    const use = String(call.use || '').trim()
    const step = i + 1

    if (!use || isHardDenied(use) || !catalogMap[use] || !HANDLER_MAP[use]) {
      failed.push({
        step,
        use: use || 'unknown',
        summary: `第 ${step} 步不能执行${use ? `（${use}）` : ''}`
      })
      break
    }

    try {
      const result = await HANDLER_MAP[use].run(ctx, call, step)
      if (!result || !result.ok) {
        failed.push({
          step,
          use,
          summary: (result && result.summary) || `第 ${step} 步失败`
        })
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
        summary: `第 ${step} 步失败：${e.message || String(e)}`
      })
      break
    }
  }

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

  // Subscribe panel: prefer the tool summary as lead/text
  if (subscribeUi && executed.some((r) => r.ui === 'subscribePanel')) {
    const sub = executed.find((r) => r.ui === 'subscribePanel')
    if (sub && sub.summary) {
      presentation.lead = sub.summary
      if (!presentation.lines.length || presentation.lines[0] !== sub.summary) {
        // keep lines from presentation; textOnly path uses summary in orchestrator
      }
    }
  }

  return {
    executed: executed.map((row) => ({
      step: row.step,
      use: row.use,
      summary: row.summary,
      ui: row.ui,
      subscribeItems: row.subscribeItems,
      inventory: row.inventory
    })),
    failed,
    possibleDuplicates,
    lines,
    lead: presentation.lead,
    blocks: presentation.blocks,
    recentItems: publicRecentItems(recentItems),
    removedItemIds,
    wrote:
      wrote ||
      executed.some((row) =>
        /item\.create|item\.update|item\.remove|item\.merge|space\.createLocation/.test(row.use)
      ),
    subscribeUi,
    subscribeItems: subscribeItems || []
  }
}

module.exports = {
  HANDLER_MAP,
  runAll
}
