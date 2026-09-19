const createItemService = require('../itemService')
const createLocationWriter = require('../locationWrite')
const { ensureCapabilities } = require('../capabilities')
const { getOrRebuildFamilyTree } = require('../familyTree')
const { fail, ok } = require('./types')
const { buildActContext, enabledMap } = require('./context')
const {
  needsConfirm,
  planNeedsUnavailableCapability,
  capabilityLimitAsk,
  inventoryAuthorityForReply
} = require('./guardrails')
const { askModel, fillAssistPrompt, renderProbe, ASSIST_PROMPT_V2 } = require('./model')
const { loadRecentItems, runProbe } = require('./itemsQuery')
const { publicRecentItems, bindCallIds, lookupRef } = require('./refs')
const { draftFromCalls } = require('./plan')
const { attachPresentation, textOnlyPresentation } = require('./presentation')
const { runAll } = require('../tools/registry')

function makeWriters(db) {
  return {
    item: createItemService(db),
    location: createLocationWriter(db)
  }
}

function focusPublic(focus) {
  return focus && { ref: focus.ref, name: focus.name }
}

async function executePlanCalls(env, openid, familyId, tree, calls, refs, catalogMap, todayYmd) {
  const writers = makeWriters(env.db)
  const ctx = {
    db: env.db,
    cloud: env.cloud,
    openid,
    familyId,
    familyCtx: { familyId, openid },
    tree,
    refs,
    catalogMap,
    todayYmd,
    writers
  }
  return runAll(ctx, calls)
}

function buildConfirmPayload(planCalls, confirmCalls, refs, focus, sessionRecent) {
  const boundCalls = bindCallIds(planCalls, refs)
  return {
    status: 'confirm',
    ask: [],
    confirm: confirmCalls.map((call) => {
      const bound = bindCallIds([call], refs)[0] || call
      if (String(call.use || '').trim() === 'item.merge') {
        const names =
          (bound.names && bound.names.filter(Boolean).length
            ? bound.names.filter(Boolean)
            : null) ||
          (Array.isArray(bound.itemIds)
            ? bound.itemIds.map((id) => {
                const row = lookupRef({ itemId: id }, refs)
                return (row && row.name) || ''
              })
            : []
          ).filter(Boolean)
        return {
          use: call.use,
          refs: bound.refs || [],
          itemIds: bound.itemIds || [],
          name: bound.name || names[0] || '物资',
          names
        }
      }
      const row = lookupRef(call, refs)
      return {
        use: call.use,
        ref: call.ref || '',
        itemId: (row && row.itemId) || call.itemId || '',
        name: (row && row.name) || call.name || ''
      }
    }),
    calls: boundCalls,
    draft: draftFromCalls(boundCalls),
    focus: focusPublic(focus),
    recentItems: publicRecentItems(sessionRecent),
    removedItemIds: [],
    wrote: false
  }
}

/**
 * Main ai.act agent loop:
 * Context → Model → Tools or direct reply → Guardrails.
 * No intent-regex pre-routers.
 */
async function act(env, openid, event) {
  const {
    db,
    resolveFamilyContext,
    listKeyDocs,
    orderKeys,
    callDeepSeek,
    actHttpTimeoutMs,
    actMaxTokens
  } = env

  const familyResult = await resolveFamilyContext(openid)
  if (familyResult.error) return familyResult.error

  const text = String((event && event.text) || '').trim()
  const confirmed = !!(event && (event.confirmed === true || event.confirmed === 'true'))
  const replayCalls = Array.isArray(event && event.calls)
    ? event.calls.filter((c) => c && typeof c === 'object')
    : []

  // Confirm replay: execute bound ids without re-planning
  if (confirmed && replayCalls.length) {
    const [catalog, treeDoc] = await Promise.all([
      ensureCapabilities(db),
      getOrRebuildFamilyTree(db, familyResult.familyId)
    ])
    const tree = treeDoc || { familyId: familyResult.familyId, spaces: [], tags: [] }
    const catalogMap = enabledMap(catalog)
    const today = env.shanghaiToday()
    const refs = {}
    const ids = []
    const seenId = {}
    replayCalls.forEach((c) => {
      const list =
        Array.isArray(c.itemIds) && c.itemIds.length
          ? c.itemIds
          : c.itemId
            ? [c.itemId]
            : []
      list.forEach((id) => {
        const s = String(id || '').trim()
        if (!s || seenId[s]) return
        seenId[s] = true
        ids.push(s)
      })
    })
    await loadRecentItems(db, familyResult.familyId, tree, ids, refs, null)
    const report = await executePlanCalls(
      env,
      openid,
      familyResult.familyId,
      tree,
      replayCalls,
      refs,
      catalogMap,
      today.ymd
    )
    return ok({
      status: 'done',
      ask: [],
      confirm: [],
      calls: replayCalls,
      report: {
        executed: (report.executed || []).map((row) => ({
          step: row.step,
          use: row.use,
          summary: row.summary
        })),
        failed: report.failed,
        possibleDuplicates: report.possibleDuplicates,
        lines: report.lines,
        lead: report.lead,
        blocks: report.blocks,
        recentItems: report.recentItems,
        removedItemIds: report.removedItemIds,
        wrote: report.wrote
      },
      lead: report.lead || '',
      blocks: report.blocks || [],
      draft: draftFromCalls(replayCalls),
      focus: null,
      recentItems: publicRecentItems(report.recentItems || []),
      removedItemIds: report.removedItemIds || [],
      wrote: !!report.wrote
    })
  }

  if (!text) return fail('INVALID_TEXT', '请输入一句话')

  const keys = orderKeys(await listKeyDocs(familyResult.familyId))
  if (!keys.length) {
    return fail('NO_AI_KEY', '请先配置家庭 AI 密钥')
  }

  const actCtx = await buildActContext(env, openid, event, familyResult)
  const {
    catalogMap,
    promptDoc,
    tree,
    today,
    refs,
    focus,
    vars,
    system,
    userText
  } = actCtx
  let sessionRecent = actCtx.sessionRecent

  const modelOpts = {
    callDeepSeek,
    keys,
    timeout: actHttpTimeoutMs || 20000,
    maxTokens: actMaxTokens || 800
  }

  let plan
  try {
    const first = await askModel(modelOpts, system, userText)
    plan = first.plan
  } catch (e) {
    return fail(e.code || 'ACT_FAILED', e.message || '助手暂时不可用，请稍后重试')
  }

  if (plan.ask.length) {
    return ok({
      status: 'ask',
      ask: plan.ask,
      probe: null,
      calls: [],
      draft: draftFromCalls(plan.calls),
      focus: focusPublic(focus),
      recentItems: publicRecentItems(sessionRecent),
      removedItemIds: [],
      wrote: false
    })
  }

  let probedRows = []
  if (plan.probe) {
    probedRows = await runProbe(db, actCtx.familyId, tree, plan.probe, refs)
    sessionRecent = sessionRecent.concat(probedRows)

    const secondVars = { ...vars, probe: renderProbe(probedRows) }
    const secondSystem = fillAssistPrompt(promptDoc.system || ASSIST_PROMPT_V2, secondVars)
    const probeNote = probedRows.length
      ? `探查结果：\n${renderProbe(probedRows)}`
      : '探查结果：无匹配物资'
    const secondUser = `${userText}\n${probeNote}`
    try {
      const second = await askModel(modelOpts, secondSystem, secondUser)
      plan = second.plan
    } catch (e) {
      return fail(e.code || 'ACT_FAILED', e.message || '助手暂时不可用，请稍后重试')
    }
    // Ignore second probe (at most one probe per act)
    plan.probe = null

    if (plan.ask.length) {
      return ok({
        status: 'ask',
        ask: plan.ask,
        probe: null,
        calls: [],
        draft: draftFromCalls(plan.calls),
        focus: focusPublic(focus),
        recentItems: publicRecentItems(sessionRecent),
        removedItemIds: [],
        wrote: false
      })
    }
  }

  // Direct reply without tools
  if (plan.reply && !(plan.calls && plan.calls.length)) {
    inventoryAuthorityForReply({
      focus,
      recentRows: actCtx.recentRows,
      probedRows,
      reply: plan.reply
    })
    const replyText = plan.reply
    return ok(
      attachPresentation(
        {
          status: 'done',
          ask: [],
          confirm: [],
          calls: [],
          report: {
            executed: [],
            failed: [],
            possibleDuplicates: [],
            lines: [replyText],
            recentItems: [],
            removedItemIds: [],
            wrote: false
          },
          draft: draftFromCalls([]),
          focus: focusPublic(focus),
          recentItems: publicRecentItems(sessionRecent),
          removedItemIds: [],
          wrote: false
        },
        textOnlyPresentation(replyText)
      )
    )
  }

  if (planNeedsUnavailableCapability(plan.calls, catalogMap)) {
    return ok({
      status: 'ask',
      ask: capabilityLimitAsk(),
      probe: null,
      calls: [],
      draft: draftFromCalls([]),
      focus: focusPublic(focus),
      recentItems: publicRecentItems(sessionRecent),
      removedItemIds: [],
      wrote: false
    })
  }

  const confirmCalls = needsConfirm(plan.calls, catalogMap)
  if (confirmCalls.length && !confirmed) {
    return ok(buildConfirmPayload(plan.calls, confirmCalls, refs, focus, sessionRecent))
  }

  const report = await executePlanCalls(
    env,
    openid,
    actCtx.familyId,
    tree,
    plan.calls,
    refs,
    catalogMap,
    today.ymd
  )

  // Subscribe panel UI
  if (report.subscribeUi || (report.executed || []).some((row) => row.ui === 'subscribePanel')) {
    const subStep = (report.executed || []).find((r) => r.ui === 'subscribePanel')
    const textLead = (subStep && subStep.summary) || report.lead || ''
    return ok(
      attachPresentation(
        {
          status: 'subscribe',
          ask: [],
          confirm: [],
          calls: plan.calls,
          subscribeItems: report.subscribeItems || [],
          report: {
            executed: (report.executed || []).map((row) => ({
              step: row.step,
              use: row.use,
              summary: row.summary
            })),
            failed: report.failed || [],
            possibleDuplicates: report.possibleDuplicates || [],
            lines: textLead ? [textLead] : report.lines || [],
            recentItems: [],
            removedItemIds: [],
            wrote: false
          },
          draft: draftFromCalls(plan.calls),
          focus: focusPublic(focus),
          recentItems: publicRecentItems(sessionRecent),
          removedItemIds: [],
          wrote: false
        },
        textOnlyPresentation(textLead)
      )
    )
  }

  return ok({
    status: 'done',
    ask: [],
    confirm: [],
    calls: plan.calls,
    report: {
      executed: (report.executed || []).map((row) => ({
        step: row.step,
        use: row.use,
        summary: row.summary
      })),
      failed: report.failed,
      possibleDuplicates: report.possibleDuplicates,
      lines: report.lines,
      lead: report.lead,
      blocks: report.blocks,
      recentItems: report.recentItems,
      removedItemIds: report.removedItemIds,
      wrote: report.wrote
    },
    lead: report.lead || '',
    blocks: report.blocks || [],
    draft: draftFromCalls(plan.calls),
    focus: focusPublic(focus),
    recentItems: publicRecentItems(sessionRecent.concat(report.recentItems || [])),
    removedItemIds: report.removedItemIds || [],
    wrote: !!report.wrote
  })
}

module.exports = {
  act
}
