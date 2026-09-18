## Context

See `proposal.md` for why. Authoritative narrative: `docs/plans/2026-09-17-ai-assistant-v2/`. AI V1 capture already lives in `packageAi` with `ai.extract` and `item-extract-v1`. Item writes still go through the `item` cloud function (`source: ui | agent`). Spaces, locations, and tags are independent collections; nesting inventory in `families` remains forbidden.

Constraints: WeChat native mini program + CloudBase; client write deny on domain and AI collections; identity from `OPENID` + membership; keep ledger fetch/filter/edit and V1 capture logic free of assistant prompt code.

## Goals / Non-Goals

**Goals:**

- Persist a compact structure tree and a versioned capability catalog
- Run `ai.act` as: load tree + catalog + prompt → model plan → optional one probe → executor via existing cloud actions
- New UI only in `packageAiAssist`; thin hooks on family page and item detail
- Reuse `familyAiKeys` and the same DeepSeek outbound path as extract

**Non-Goals (design-level):**

- LangGraph, `chatProxy`, streaming, speech, vision
- Client-side `wx.request` to DeepSeek
- Merging items or exposing merge in the catalog
- Sharing `utils/cloud.js` cache tables for `ai.act` reads (writes still go through `item` so ledger cache invalidates as today)

## Decisions

### 1. New subpackage, V1 FAB untouched

**Choice:** Register `packageAiAssist` with one assistant page. Family page adds a tool control; item detail passes `itemId` as focus. Ledger capture FAB still `navigateTo` `packageAi/capture`.

**Why:** Specs require coexistence. Two product surfaces, one key settings page.

**Alternatives:** Replace the FAB (breaks V1); resurrect `pages/chat` (rejected IA); AppShell-global assistant (touches every page).

### 2. Server-side executor calls existing cloud functions

**Choice:** `ai.act` parses the plan and `cloud.callFunction` to `item` / `space` with the same actions the mini program uses (`create` / `update` / `remove` / `search` / `listExpiring` / `createLocation`). Do not copy `createItem` into `ai`.

**Why:** Single validation, activities, and cache invalidation. Unlike V1 capture, the member is not stepping through preview cards before each write, so the cloud function must orchestrate.

**Alternatives:** Return the plan to the client to call `callItem` (extra round trips, easier to skip confirm); duplicate DB writes in `ai` (drifts).

### 3. Structure tree as its own document

**Choice:** `familyTrees` `_id = familyId` with `rev`, `spaces[]` (id, name, isDefault, locations[]), `tags[]`. Prompt rendering uses names only. Patch `rev` after successful space/tag/location writes; rebuild by listing those collections when the doc is missing or `rev` cannot be trusted. Item writes do not touch the tree.

**Why:** One get for configuration; inventory stays in `items`. Matches the anti-pattern of not stuffing goods into `families`.

**Alternatives:** Join three collections on every act (works, no sync bugs, slower and easier to drift from a documented contract); nest tree on `families` (rejected).

### 4. Capability catalog beside prompts

**Choice:** `aiCapabilities` `_id = assist-act-v2`, `version` + `apis[]`. Seed in cloud function like `ensureExtractPrompt`. Render enabled rows into `{{CAPABILITIES}}`. Executor: `use` ∈ enabled ids ∩ in-code deny list (`family.*`, keys, extract, transcribe, merge).

**Why:** Prompt and executor cannot drift. Catalog version can bump without rewriting few-shots.

**Alternatives:** Hardcode the whitelist only in `assist-act-v2` system text (executor and prompt diverge); per-family flags (not requested).

### 5. One act prompt, not five scene personas

**Choice:** `aiPrompts.assist-act-v2` with sectioned capability instructions. Placeholders: `TODAY` `WEEKDAY` `FAMILY_NAME` `CAPABILITIES` `TREE` `HISTORY` `FOCUS` `PROBE`. JSON plan: `ask`, `probe`, `calls`. Client never sends the system prompt. Follow-up turns pass a short sanitized transcript plus recent item ids (rendered as `R*` refs), not database ids.

**Why:** The product decision is that the model chooses among listed APIs. A code `route` step would hide capabilities.

**Alternatives:** Keyword router (rejected); five separate prompts (hides APIs).

### 6. Probe and confirm stay in one cloud function

**Choice:** If `ask` is non-empty, return it and write nothing. If `probe` is set, query items once (search or location filter), refill `PROBE`, call the model at most one more time; ignore a second probe. `item.remove` (and any `confirm: true` api) requires `event.confirmed === true` from the page after showing the plan.

**Why:** Specs cap probe at one. Delete must not run on the first shot.

**Alternatives:** Client-driven tool loop (easy to drop); always inject all items (rejected).

### 7. Duplicate report is code, merge stays off

**Choice:** After creates, compare new items to same space+location+name hits; list them on the report. Catalog keeps `item.merge` disabled.

**Why:** Product: no merge unless a later change enables it.

**Alternatives:** Auto-add quantity (rejected in discussion).

### 8. Dissolve and create-home hooks

**Choice:** Family create after default space/tags writes a tree. Owner dissolve deletes `familyTrees`. Member leave does not. Same pattern as keys/media.

**Why:** Tree is family-scoped configuration.

## Risks / Trade-offs

- [60s budget with two model calls] → Probe only when the plan asks; fail clearly; no images on the wire.
- [Tree patch races] → Last write wins; next act rebuilds if the doc is missing or malformed.
- [callFunction from `ai` to `item` identity] → Rely on the same OPENID context; do not pass a forged openid. If nested call drops OPENID in this environment, fall back to requiring shared modules—but do not reimplement rules.
- [Model invents ids] → Prompt forbids `_id`; executor only accepts short refs from this turn’s FOCUS/PROBE.
- [Two AI entries] → Copy must distinguish「拍照录入」vs「文字助手」.

## Migration Plan

1. Create `familyTrees` / `aiCapabilities`, rules (client deny), indexes (`familyTrees` by `_id` is enough).
2. Deploy `ai` with act + ensure catalog/prompt; then space/tag/family hooks.
3. Ship subpackage + family/detail entries. Capture FAB unchanged. Missing `ai.act` must toast without breaking ledger `onShow`.
4. Rollback: unregister assistant routes and hooks; leave unused collections. Do not revert V1 extract.

No backfill required beyond lazy rebuild on first act.

## Open Questions

- Nested `cloud.callFunction` OPENID in this CloudBase environment: confirm during implementation; if it fails, extract a shared write helper used by both `item` and `ai` rather than a second validator.
