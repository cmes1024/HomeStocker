/**
 * Shared result shapes for ai.act agent runtime.
 *
 * ok / fail — top-level act response wrappers (same as before).
 * ToolResult — each tools/*.js handler.run(ctx, call, step) returns:
 *   { ok: true, summary, inventory?, wrote?, remember?, removedItemIds?, subscribeItems?, ui? }
 *   { ok: false, summary }
 * ui: 'subscribePanel' + subscribeItems → orchestrator returns status: 'subscribe'.
 */

function fail(code, message) {
  return { ok: false, code, message }
}

function ok(data) {
  return { ok: true, data }
}

module.exports = {
  fail,
  ok
}
