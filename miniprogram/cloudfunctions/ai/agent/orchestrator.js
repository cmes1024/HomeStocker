const createItemService = require('../itemService')
const createLocationWriter = require('../locationWrite')
const createSpaceWriter = require('../spaceWrite')
const createTagWriter = require('../tagWrite')
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
const { askModel, fillAssistPrompt, renderProbe, renderExecReceipt, ASSIST_PROMPT_V2 } = require('./model')
const { loadRecentItems, runProbe } = require('./itemsQuery')
const { publicRecentItems, bindCallIds, lookupRef } = require('./refs')
const { draftFromCalls } = require('./plan')
const { attachPresentation, textOnlyPresentation, buildExecutionPresentation } = require('./presentation')
const { runAll } = require('../tools/registry')
const { renderTreeNames } = require('../familyTree')

function makeWriters(db) {
  return {
    item: createItemService(db),
    location: createLocationWriter(db),
    space: createSpaceWriter(db),
    tag: createTagWriter(db)
  }
}

function focusPublic(focus) {
  return focus && { ref: focus.ref, name: focus.name }
}

/** 从「把厨房的牛奶放到…」类话术里猜要改的物品，供澄清后补探查 */
function guessMoveItemHintFromHistory(history, currentText) {
  const texts = []
  ;(history || []).forEach((row) => {
    if (row && row.role === 'user' && row.text) texts.push(String(row.text))
  })
  if (currentText) texts.push(String(currentText))
  for (let i = texts.length - 1; i >= 0; i--) {
    const text = texts[i]
    const m = text.match(/把(.{1,24}?)(?:放到|挪到|移到|放去|挪去|搬到)/)
    if (!m) continue
    const chunk = String(m[1] || '')
      .replace(/里的|中的/g, '的')
      .trim()
    if (!chunk) continue
    const parts = chunk.split('的').map((p) => p.trim()).filter(Boolean)
    const name = (parts.length > 1 ? parts[parts.length - 1] : chunk).trim()
    if (!name || name.length > 20) continue
    let spaceName = ''
    if (parts.length > 1) {
      spaceName = parts
        .slice(0, -1)
        .join('')
        .replace(/冰箱.*$|柜子.*$|冷藏.*$|冷冻.*$|货架.*$/g, '')
        .trim()
    }
    return { name, spaceName }
  }
  return null
}

/** 改/删缺短号时先探查，避免「厨房的牛奶」或澄清芯片直接失败 */
function ensureProbeForUnresolvedWrites(plan, refs, history, currentText) {
  if (!plan || plan.probe || (plan.ask && plan.ask.length)) return plan
  const calls = plan.calls || []
  const hint = guessMoveItemHintFromHistory(history, currentText)
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i] || {}
    const use = String(call.use || '').trim()
    if (use === 'item.update' || use === 'item.remove') {
      if (lookupRef(call, refs)) continue
      const name =
        String(call.name || '').trim() || (hint && hint.name) || ''
      if (name) {
        plan.probe = {
          name,
          spaceName:
            String(call.fromSpaceName || call.sourceSpaceName || '').trim() ||
            (hint && hint.spaceName) ||
            '',
          locationName: String(
            call.fromLocationName || call.sourceLocationName || ''
          ).trim()
        }
        if (!call.name) call.name = name
        return plan
      }
    }
    if (use === 'item.merge' || use === 'item.removeMany') {
      const refList = Array.isArray(call.refs) ? call.refs : call.ref ? [call.ref] : []
      const unresolved = refList.some((raw) => !lookupRef({ ref: raw }, refs))
      if (!unresolved && (Array.isArray(call.itemIds) ? call.itemIds.length : 0)) continue
      if (unresolved || !refList.length) {
        const name =
          String(call.name || (call.names && call.names[0]) || '').trim() ||
          (hint && hint.name) ||
          ''
        if (name) {
          plan.probe = { name }
          return plan
        }
      }
    }
  }
  return plan
}

/** 探查后模型仍漏短号时，唯一命中则自动绑上 */
function bindUnresolvedWritesToProbe(plan, refs, probedRows) {
  const rows = probedRows || []
  if (!plan || !rows.length) return plan
  ;(plan.calls || []).forEach((call) => {
    if (!call || typeof call !== 'object') return
    const use = String(call.use || '').trim()
    if (use !== 'item.update' && use !== 'item.remove') return
    if (lookupRef(call, refs)) return
    const name = String(call.name || '').trim()
    let hit = null
    if (name) {
      const matches = rows.filter((row) => row && row.name === name)
      if (matches.length === 1) hit = matches[0]
    } else if (rows.length === 1) {
      hit = rows[0]
    }
    if (!hit) return
    call.ref = hit.ref
    if (!call.name) call.name = hit.name
  })
  return plan
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
    treeDirty: false,
    refs,
    catalogMap,
    todayYmd,
    writers
  }
  return runAll(ctx, calls)
}

function stepOffset(report) {
  let max = 0
  ;[(report && report.executed) || [], (report && report.failed) || []].forEach((list) => {
    list.forEach((row) => {
      const n = Number(row.step) || 0
      if (n > max) max = n
    })
  })
  return max
}

function mergeCreateReports(first, second) {
  const offset = stepOffset(first)
  const executed = (first.executed || []).slice()
  const failed = (first.failed || []).slice()
  const possibleDuplicates = (first.possibleDuplicates || []).slice()
  ;((second && second.executed) || []).forEach((row) => {
    executed.push({ ...row, step: (Number(row.step) || 0) + offset })
  })
  ;((second && second.failed) || []).forEach((row) => {
    failed.push({ ...row, step: (Number(row.step) || 0) + offset })
  })
  ;((second && second.possibleDuplicates) || []).forEach((row) => {
    possibleDuplicates.push(row)
  })
  const presentation = buildExecutionPresentation(
    executed,
    failed,
    possibleDuplicates,
    (second && second.tree) || (first && first.tree)
  )
  const recentItems = []
    .concat((first && first.recentItems) || [])
    .concat((second && second.recentItems) || [])
  const removedItemIds = []
    .concat((first && first.removedItemIds) || [])
    .concat((second && second.removedItemIds) || [])
  return {
    executed,
    failed,
    pending: (second && second.pending) || [],
    createClassFailed: !!(second && second.createClassFailed),
    possibleDuplicates,
    lines: presentation.lines && presentation.lines.length ? presentation.lines : ['没有需要执行的操作'],
    lead: presentation.lead || (first && first.lead) || '',
    blocks: presentation.blocks || [],
    recentItems,
    removedItemIds,
    wrote: !!(first && first.wrote) || !!(second && second.wrote),
    subscribeUi: !!(second && second.subscribeUi) || !!(first && first.subscribeUi),
    subscribeItems:
      (second && second.subscribeItems) || (first && first.subscribeItems) || [],
    tree: (second && second.tree) || (first && first.tree),
    replanned: true
  }
}

function collectKnowledgeBodies(report) {
  const bodies = []
  ;((report && report.executed) || []).forEach((row) => {
    if (!(row && row.use === 'knowledge.get' && row.knowledge && row.knowledge.body)) return
    const title = String(row.knowledge.title || '').trim()
    const body = String(row.knowledge.body || '').trim()
    if (!body) return
    bodies.push(title ? `${title}\n${body}` : body)
  })
  return bodies
}

function knowledgeFallbackText(report) {
  const row = ((report && report.executed) || []).find(
    (r) => r && r.use === 'knowledge.get' && r.summary
  )
  return row ? String(row.summary || '').trim() : ''
}

/** 本轮实质只有知识阅读（无写库 / 无库存列表 / 无订阅面板）→ 二次短答 */
function isKnowledgeOnlyReport(report) {
  if (!report) return false
  if (report.wrote || report.subscribeUi) return false
  const exec = report.executed || []
  if (!exec.some((r) => r && r.use === 'knowledge.get' && r.knowledge && r.knowledge.body)) {
    return false
  }
  if (exec.some((r) => r && Array.isArray(r.inventory))) return false
  if (exec.some((r) => r && r.ui === 'subscribePanel')) return false
  return true
}

function buildDonePayload(planCalls, report, focus, sessionRecent) {
  return {
    status: 'done',
    ask: [],
    confirm: [],
    calls: planCalls,
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
      wrote: report.wrote,
      replanned: !!report.replanned
    },
    lead: report.lead || '',
    blocks: report.blocks || [],
    draft: draftFromCalls(planCalls),
    focus: focusPublic(focus),
    recentItems: publicRecentItems(sessionRecent.concat(report.recentItems || [])),
    removedItemIds: report.removedItemIds || [],
    wrote: !!report.wrote
  }
}

function buildConfirmPayload(planCalls, confirmCalls, refs, focus, sessionRecent) {
  const boundCalls = bindCallIds(planCalls, refs)
  return {
    status: 'confirm',
    ask: [],
    confirm: confirmCalls.map((call) => {
      const bound = bindCallIds([call], refs)[0] || call
      const use = String(call.use || '').trim()
      if (use === 'item.merge' || use === 'item.removeMany') {
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
      if (
        use === 'space.removeMany' ||
        use === 'tag.removeMany' ||
        use === 'tag.createMany'
      ) {
        let names = Array.isArray(bound.names)
          ? bound.names.map((n) => String(n || '').trim()).filter(Boolean)
          : []
        if (!names.length && Array.isArray(bound.spaces)) {
          names = bound.spaces
            .map((s) => String((s && (s.name || s.spaceName)) || '').trim())
            .filter(Boolean)
        }
        if (!names.length && Array.isArray(bound.tags)) {
          names = bound.tags
            .map((t) => String((t && (t.name || t.tagName)) || '').trim())
            .filter(Boolean)
        }
        return {
          use: call.use,
          names,
          name: names[0] || bound.name || '多项'
        }
      }
      if (use === 'space.removeLocationMany') {
        const labels = (Array.isArray(bound.locations) ? bound.locations : [])
          .map((l) => {
            const sn = String((l && l.spaceName) || '').trim()
            const ln = String((l && (l.locationName || l.name)) || '').trim()
            if (sn && ln) return `${sn}/${ln}`
            return ln || sn
          })
          .filter(Boolean)
        return {
          use: call.use,
          names: labels,
          name: labels[0] || '位置'
        }
      }
      if (use === 'space.remove' || use === 'tag.remove' || use === 'tag.create') {
        const name = String(
          bound.spaceName || bound.name || bound.tagName || ''
        ).trim()
        return { use: call.use, name: name || '项目', names: name ? [name] : [] }
      }
      if (use === 'space.removeLocation') {
        const sn = String(bound.spaceName || '').trim()
        const ln = String(bound.locationName || bound.name || '').trim()
        const label = sn && ln ? `${sn}/${ln}` : ln || sn || '位置'
        return { use: call.use, name: label, names: [label] }
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

  ensureProbeForUnresolvedWrites(plan, refs, actCtx.history, text)

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
    bindUnresolvedWritesToProbe(plan, refs, probedRows)

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

  // 创建类失败：回灌 EXEC，最多一轮模型重编排（代码不决策如何降级）
  let finalReport = report
  let finalCalls = plan.calls
  if (report.createClassFailed && !report.subscribeUi) {
    const treeAfter = report.tree || tree
    const treeText = renderTreeNames(treeAfter)
    const execText = renderExecReceipt(report, treeText)
    const replanVars = {
      ...vars,
      tree: treeText,
      exec: execText,
      probe: vars.probe || '无'
    }
    const replanSystem = fillAssistPrompt(promptDoc.system || ASSIST_PROMPT_V2, replanVars)
    const replanUser = `${userText}\n（执行回执如下，请只重编排尚未完成的事，勿重复已成功步骤。）\n${execText}`
    try {
      const replan = await askModel(modelOpts, replanSystem, replanUser)
      const nextPlan = replan.plan
      nextPlan.probe = null
      if (nextPlan.ask && nextPlan.ask.length) {
        return ok({
          status: 'ask',
          ask: nextPlan.ask,
          probe: null,
          calls: [],
          draft: draftFromCalls(nextPlan.calls),
          focus: focusPublic(focus),
          recentItems: publicRecentItems(sessionRecent.concat(report.recentItems || [])),
          removedItemIds: report.removedItemIds || [],
          wrote: !!report.wrote,
          report: {
            executed: (report.executed || []).map((row) => ({
              step: row.step,
              use: row.use,
              summary: row.summary
            })),
            failed: report.failed,
            possibleDuplicates: report.possibleDuplicates,
            lines: report.lines,
            wrote: report.wrote
          }
        })
      }
      if (nextPlan.calls && nextPlan.calls.length) {
        if (planNeedsUnavailableCapability(nextPlan.calls, catalogMap)) {
          return ok({
            status: 'ask',
            ask: capabilityLimitAsk(),
            probe: null,
            calls: [],
            draft: draftFromCalls([]),
            focus: focusPublic(focus),
            recentItems: publicRecentItems(sessionRecent.concat(report.recentItems || [])),
            removedItemIds: report.removedItemIds || [],
            wrote: !!report.wrote
          })
        }
        const confirm2 = needsConfirm(nextPlan.calls, catalogMap)
        if (confirm2.length && !confirmed) {
          return ok(
            buildConfirmPayload(
              nextPlan.calls,
              confirm2,
              refs,
              focus,
              sessionRecent.concat(report.recentItems || [])
            )
          )
        }
        const secondReport = await executePlanCalls(
          env,
          openid,
          actCtx.familyId,
          treeAfter,
          nextPlan.calls,
          refs,
          catalogMap,
          today.ymd
        )
        finalReport = mergeCreateReports(report, secondReport)
        finalCalls = (plan.calls || []).concat(nextPlan.calls || [])
      }
    } catch (e) {
      // 重规划失败：仍返回首轮执行结果
      console.warn('act replan failed', e && e.message)
    }
  }

  // 知识库：回灌正文再短答（对齐 probe 二次模型）；聊天不展示 FAQ 全文
  if (isKnowledgeOnlyReport(finalReport)) {
    const knowledgeBodies = collectKnowledgeBodies(finalReport)
    const knowledgeText = knowledgeBodies.join('\n\n')
    const knowVars = {
      ...vars,
      knowledge: knowledgeText || '无',
      probe: vars.probe || '无',
      exec: '无'
    }
    const knowSystem = fillAssistPrompt(promptDoc.system || ASSIST_PROMPT_V2, knowVars)
    const knowUser = `${userText}\n（系统已取回知识正文，请只用 reply 两三句回答当前问题重点；禁止再 knowledge.get / probe / 写台账；禁止粘贴【】全文或合规长段。）\n知识正文：\n${knowledgeText}`
    let replyText = ''
    try {
      const second = await askModel(modelOpts, knowSystem, knowUser)
      replyText = String((second.plan && second.plan.reply) || '').trim()
      if (!replyText && second.plan && second.plan.ask && second.plan.ask.length) {
        const q = second.plan.ask[0] && second.plan.ask[0].question
        replyText = String(q || '').trim()
      }
    } catch (e) {
      console.warn('act knowledge reply failed', e && e.message)
    }
    if (!replyText) replyText = knowledgeFallbackText(finalReport)
    if (replyText) {
      const slimReport = {
        executed: (finalReport.executed || []).map((row) => ({
          step: row.step,
          use: row.use,
          summary: row.summary
        })),
        failed: finalReport.failed || [],
        possibleDuplicates: [],
        lines: [replyText],
        recentItems: [],
        removedItemIds: [],
        wrote: false
      }
      return ok(
        attachPresentation(
          {
            status: 'done',
            ask: [],
            confirm: [],
            calls: finalCalls,
            report: slimReport,
            draft: draftFromCalls(finalCalls),
            focus: focusPublic(focus),
            recentItems: publicRecentItems(sessionRecent),
            removedItemIds: [],
            wrote: false
          },
          textOnlyPresentation(replyText)
        )
      )
    }
  }

  // Subscribe panel UI
  if (
    finalReport.subscribeUi ||
    (finalReport.executed || []).some((row) => row.ui === 'subscribePanel')
  ) {
    const subStep = (finalReport.executed || []).find((r) => r.ui === 'subscribePanel')
    const textLead = (subStep && subStep.summary) || finalReport.lead || ''
    return ok(
      attachPresentation(
        {
          status: 'subscribe',
          ask: [],
          confirm: [],
          calls: finalCalls,
          subscribeItems: finalReport.subscribeItems || [],
          report: {
            executed: (finalReport.executed || []).map((row) => ({
              step: row.step,
              use: row.use,
              summary: row.summary
            })),
            failed: finalReport.failed || [],
            possibleDuplicates: finalReport.possibleDuplicates || [],
            lines: textLead ? [textLead] : finalReport.lines || [],
            recentItems: [],
            removedItemIds: [],
            wrote: false
          },
          draft: draftFromCalls(finalCalls),
          focus: focusPublic(focus),
          recentItems: publicRecentItems(sessionRecent),
          removedItemIds: [],
          wrote: false
        },
        textOnlyPresentation(textLead)
      )
    )
  }

  return ok(buildDonePayload(finalCalls, finalReport, focus, sessionRecent))
}

module.exports = {
  act
}
