## Context

See `proposal.md` for why. V2 assistant already ships: `packageAiAssist`, `ai.act`, `aiCapabilities`, `familyTrees`, `assist-act-v2` prompt, shared `itemService` for writes. Authoritative prior narrative: `docs/plans/2026-09-17-ai-assistant-v2/` and `openspec/changes/ai-assistant-v2/`.

Current pain is structural: `act.js` (~2k lines) mixes intent heuristics, prompt fill, probe, `executeCalls` if-chains, and reply blocks. Product decision was already “model chooses among listed APIs”; code drifted into pre-routing.

Constraints unchanged: WeChat native + CloudBase; no client domain writes; OPENID + membership; single write path via item/space/tag services; no LangGraph / `chatProxy` / resurrect `pages/chat` in this change.

## Goals / Non-Goals

**Goals:**

- One agent loop: context builder → model plan → tool runtime → guardrails → response
- One module per enabled tool (schema aligned with capability seed, validate/bind, run, normalize result)
- Remove intent-regex routers that skip or rewrite the model
- Keep client protocol compatible enough that `packageAiAssist` needs only small adapters (ask / confirm / done / lead+blocks)

**Non-Goals:**

- LangGraph, streaming, speech, vision, V1 capture changes
- OpenAI/DeepSeek native tools API as a hard requirement (JSON plan may remain; shape can mirror tool calls)
- Generic DB tools or duplicating validation outside `itemService` / location writer
- Archiving or rewriting the whole `ai-assistant-v2` change history in this pass

## Decisions

### 1. Standard loop stays inside `ai.act`

**Choice:** Keep a single cloud action as orchestrator. Internally split into `context`, `tools/`, `guardrails`, thin `act.js`.

**Why:** Matches CloudBase deploy unit and existing client; no new service.

**Alternatives:** External `agent/` FastAPI (rejected for this stage); client-driven tool loop (more round trips, easier to skip confirm).

### 2. Tool = capability row + handler module

**Choice:** Each enabled `apis[]` id maps to a handler: `id`, args/hint for prompt, `confirm`, `validate(ctx, args)`, `run(ctx, args) → ToolResult`. Registry loads enabled ∩ ¬hardDeny. `executeCalls` becomes `registry.runAll(plan.calls)`.

**Why:** Adding a capability stops being another branch in a god file.

**Alternatives:** Keep monolithic switch (status quo); generate handlers from seed only (too rigid for name→id binding).

### 3. Model owns intent; heuristics deleted

**Choice:** Remove `isStructureOnlyIntent`, inventory force-probe rewrites, and pre-model expire-subscribe short-circuit. Teach structure answers and probe-when-needed in `assist-act-v2`. Inventory authority rule enforced in guardrails (below), not by regex.

**Why:** Aligns with product decision and user mental model.

**Alternatives:** Keep heuristics as “safety” (continues dual brain).

### 4. Expire subscribe becomes a tool outcome

**Choice:** Add (or map) an enabled tool such as `item.expireSubscribePanel` that lists panel rows / sets response flag for the existing client panel UI. Model may call it; entry no longer returns before `askModel`.

**Why:** Platform gesture limit is a tool/UI concern, not an intent classifier.

**Alternatives:** Keep pre-router (simple but violates sole-intent-router); drop subscribe from assistant (product regression).

### 5. Guardrail: no fabricated inventory

**Choice:** If the post-tool (or no-tool) path would show stock counts/rows, require those rows to come from tool results or injected focus/probe/recent. Strip or downgrade model-only stock claims. Do not reintroduce keyword inventory routers.

**Why:** TREE has no items; models invent stock.

**Alternatives:** Always force probe on any goods question (heuristic again).

### 6. Confirm replay stays model-skip

**Choice:** `confirmed + calls` continues to execute bound ids without re-planning.

**Why:** Spec already requires stable delete; this is protocol, not intent analysis.

### 7. Prompt/plan format

**Choice:** Keep JSON plan (`ask` / `probe` / `calls`) for now; render tools from the same registry used at runtime. Bump capability + prompt versions together when tool list or handler semantics change.

**Why:** Lowest migration risk; native function-calling can wait.

**Alternatives:** Switch to provider tool_calls immediately (more moving parts this change).

### 8. File layout (illustrative)

```
cloudfunctions/ai/
  act.js                 # thin export + loop
  agent/
    context.js           # tree, catalog, focus, history, prompt fill
    orchestrator.js      # ask → probe? → tools → report
    guardrails.js        # confirm, deny, inventory authority
  tools/
    registry.js
    itemSearch.js
    itemListExpiring.js
    itemCreate.js
    itemUpdate.js
    itemRemove.js
    itemMerge.js         # if still enabled in seed
    spaceCreateLocation.js
    itemExpireSubscribePanel.js
  capabilities.js        # seed + ensure (existing)
  itemService.js         # unchanged role
```

Exact filenames may adjust; the boundary above is the contract.

## Risks / Trade-offs

- [Model quality without heuristics] → Strengthen assist prompt sections; accept some ask/probe differences vs old regex paths; cover with acceptance checklist.
- [Extra model call on subscribe] → Cheap text-only; still one act from the member’s view.
- [Large refactor regression] → Land handlers with behavior parity tests/checklist per tool before deleting heuristics; feature-flag not required if deploy is atomic for `ai` cloud function.
- [Nested identity] → Keep using shared `itemService` (already solved); tools must not reintroduce nested `callFunction` assumptions.

## Migration Plan

1. Extract handlers behind registry while `executeCalls` still works; route plan `use` through registry.
2. Switch orchestrator to new modules; delete intent helpers once checklist passes.
3. Bump `aiCapabilities` / `assist-act-v2` versions; seed expire-subscribe tool; deploy `ai`.
4. Adjust `packageAiAssist` only if response shape for subscribe panel changes.
5. Rollback: redeploy previous `ai` build; no data migration.

## Open Questions

- None that block specs or tasks: native provider tools deferred; handler file names left flexible in tasks.
