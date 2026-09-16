## Context

See `proposal.md` for why. Manual item create already goes through the `item` cloud function (`source: ui | agent`). Spaces and locations are separate collections. The 2026-09-07 assistant design is a chat + LangGraph path; this change is a capture wizard only. Authoritative narrative: `docs/plans/2026-09-16-package-ai-capture/`.

Constraints: WeChat native mini program + CloudBase; client must not write `items` / new AI collections; identity from `OPENID` + membership; do not nest key arrays in a way that `getMyFamily` leaks secrets; keep list/edit pages free of model and speech code.

## Goals / Non-Goals

**Goals:**

- Isolate UI in `packageAi` and logic in a new `ai` cloud function
- Reuse `callItem('create')` and `callSpace('createLocation')` so cache invalidation and activities stay as they are
- Hold DeepSeek keys at family scope; call the model only from the cloud function
- Persist covers beside items without an `items` schema change

**Non-Goals (design-level):**

- Running LangGraph or `chatProxy` in this change
- Streaming SSE / HTTP cloud functions
- Client-side `wx.request` to DeepSeek
- Sharing `utils/cloud.js` cache tables for `ai` reads in v1

## Decisions

### 1. Sidecar package + thin ledger hook

**Choice:** New subpackage `packageAi`; ledger adds only a FAB `navigateTo`. Optional one-line on the family page.

**Why:** Matches “AI is a branch of current business.” List fetch/filter/edit stay untouched.

**Alternatives:** AppShell-global FAB (still touches a shared shell used by every page); resurrect `pages/chat` (wrong IA).

### 2. Cloud function outbound, not CloudBase AI SDK and not client keys

**Choice:** `ai.extract` uses axios to `https://api.deepseek.com/v1/chat/completions` with the family’s stored key. Function timeout 60s, HTTP timeout ~45s, `stream: false`, `response_format: json_object`.

**Why:** Per-family BYOK cannot use environment-level `wx.cloud.extend.AI`. Mini program 合法域名 + storing `sk-` on device is unsafe. `chatProxy` already proved outbound HTTPS.

**Alternatives:** `extend.AI` (one product bill); client BYOK (rejected); independent Agent service (needed later for tool loops, overkill for one JSON extract).

### 3. Preset DeepSeek fields stored even if hidden

**Choice:** `familyAiKeys` still stores `provider`, `baseUrl`, `model`; UI only pastes `apiKey` + optional `label`. Constants: baseUrl `https://api.deepseek.com/v1`, model `deepseek-chat`. Max 3 keys; one `isDefault`; failover on 401/402/429/5xx/timeout, whole extract retried.

**Why:** Adding another vendor later does not migrate the collection. User-supplied baseUrl is an SSRF footgun; v1 does not accept it.

**Alternatives:** Hardcode URL only in code (weaker for multi-key records); custom URL in UI (deferred).

### 4. One extract call; names not ids

**Choice:** Client sends `{ rows: [{ index, text }] }`. Server injects prompt from `aiPrompts` (`item-extract-v1`) plus today’s Shanghai date and family catalogs. Model returns names; server maps to `spaceId` / `locationId` / `tagIds`. Unmatched space → default warehouse; unmatched location name → `willCreateLocation`; unmatched tags dropped. Prompt lives in DB, **not** sent from the client.

**Why:** System prompt dwarfs user text; one call saves quota. Models hallucinate ids. Client-supplied prompts can be tampered.

**Alternatives:** Per-row model calls (for future vision); client-cached prompt (rejected).

### 5. Client orchestrates writes; `ai` does not clone `createItem`

**Choice:** After confirm, the mini program calls existing space/item actions then `ai.attachMedia`. Sequential; stop on first item failure.

**Why:** Single write model for UI and future Agent. Duplicating validation in `ai` would drift.

**Alternatives:** `ai.commit` that writes items internally (rejected).

### 6. Images in `itemMedia`, not `items`

**Choice:** New collection + cloud storage fileID. List/detail ignore it this version. Dissolve deletes docs and best-effort files.

**Why:** Avoids changing `item` cloud function and list tiles. Visualization remains on the preview step.

**Alternatives:** Add `imageFileIds` on `items` (smallest product win for covers, violates the isolation goal).

### 7. Dissolve hook is the only family-function edit

**Choice:** Extend owner-dissolve cleanup to `familyAiKeys` and `itemMedia`, same pattern as tags/activities. Member leave does not delete household keys.

**Why:** Secrets must not outlive the family. Ordinary leave should not strip remaining members’ quota.

### 8. Speech plugin on device, audio never to the model

**Choice:** WeChat simultaneous-interpretation plugin (or current official STT equivalent) writes text into the row. Only that text is extracted.

**Why:** V1 is voice-primary, not multimodal. Keeps payload small and timeout safe.

## Risks / Trade-offs

- [DeepSeek latency / 60s cap] → Keep extract to short texts, no images; fail clearly; failover another key rather than hanging.
- [Key theft if ever returned to client] → Masked list only; logs show last four chars; no Storage.
- [Equal rights: any joiner can delete the household key] → Same as theme switch; copy must say it is a shared secret.
- [List still text-only] → Accepted; covers wait for a later UI change.
- [Prompt quality / mixed rows] → Index-tagged JSON; default one-row-one-item; same item split across places with per-place quantities becomes multiple cards sharing the row photo.
- [Cold start + model] → User waits on a single “识别中”; do not parallelize N cloud functions in v1.
- [Orphan item if upload fails after create] → Item remains; media optional; show a non-blocking warning.

## Migration Plan

1. Create collections, rules, indexes; seed `aiPrompts`.
2. Deploy `ai` with public outbound and 60s timeout; then family dissolve cleanup.
3. Ship subpackage + FAB. If `ai` is missing, FAB must error without breaking ledger `onShow`.
4. Rollback: unregister FAB and subpackage; leave unused collections. No item schema to revert.

No backfill. Existing items have no sidecar media.

## Open Questions

- Exact WeChat STT plugin id / version at implementation time (behavior is unchanged: text into the row).
- Whether to show the family-page key link in the first UI slice or only in-capture empty-key guidance (both satisfy specs).
