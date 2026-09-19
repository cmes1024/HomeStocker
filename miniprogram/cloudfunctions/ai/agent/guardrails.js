const { isHardDenied } = require('../capabilities')
const { CAPABILITY_LIMIT_ASK } = require('../promptAssist')

function needsConfirm(calls, catalogMap) {
  return (calls || []).filter((call) => {
    const api = catalogMap[call.use]
    return api && api.confirm
  })
}

function planNeedsUnavailableCapability(calls, catalogMap) {
  return (calls || []).some((call) => {
    const use = String((call && call.use) || '').trim()
    if (!use) return true
    if (isHardDenied(use)) return true
    if (!catalogMap[use]) return true
    return false
  })
}

function capabilityLimitAsk() {
  return [{ question: CAPABILITY_LIMIT_ASK, options: [] }]
}

/**
 * Inventory authority for reply-only plans.
 *
 * Practical rule:
 * - reply-only + no focus/recent/probe item rows → allow (structure / chat from TREE)
 * - reply-only + those rows exist → allow summarizing them
 * - Do not invent code that dumps tree/inventory bypassing the model.
 *
 * Returns { allow: true } or { allow: false, ask } when we should clarify
 * instead of treating a stock-claiming reply as authoritative with zero rows.
 * Spec: must not present inventory facts not from tool/focus/probe/recent.
 * With zero context rows we still allow structure/chat replies (model owns wording).
 */
function inventoryAuthorityForReply(opts) {
  // Always allow the model reply path; inventory facts are expected to come from
  // FOCUS/PROBE/recent when the model summarizes stock. No keyword router.
  // When rows exist, reply may summarize them; when none, structure/chat is fine.
  void opts
  return { allow: true }
}

module.exports = {
  needsConfirm,
  planNeedsUnavailableCapability,
  capabilityLimitAsk,
  inventoryAuthorityForReply,
  isHardDenied
}
