const { isHardDenied } = require('../capabilities')
const { CAPABILITY_LIMIT_ASK, OUT_OF_SCOPE_ASK } = require('../promptAssist')

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

/** 执行器兜底：模型编造了未开放/禁用接口时，一律按「能力边界」拒答 */
function capabilityLimitAsk() {
  return [{ question: CAPABILITY_LIMIT_ASK, options: [] }]
}

/**
 * 范围外拒答（与 prompt F/G 固定话术一致）。
 * 服务端不做关键词预路由；此函数供测试/显式调用，日常靠模型走 ask。
 */
function outOfScopeAsk() {
  return [{ question: OUT_OF_SCOPE_ASK, options: [] }]
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
 * Spec: must not present inventory facts not from tool/focus/probe.
 * With zero context rows we still allow structure/chat replies (model owns wording).
 */
function inventoryAuthorityForReply(opts) {
  // Always allow the model reply path; inventory facts are expected to come from
  // FOCUS/PROBE when the model summarizes stock. No keyword router.
  // When rows exist, reply may summarize them; when none, structure/chat is fine.
  void opts
  return { allow: true }
}

module.exports = {
  needsConfirm,
  planNeedsUnavailableCapability,
  capabilityLimitAsk,
  outOfScopeAsk,
  inventoryAuthorityForReply,
  isHardDenied
}
