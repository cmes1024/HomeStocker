## Context

See proposal.md — Why. Today `aiCapabilities` only lists domain APIs; `knowledge/` is the progressive-fetch pattern. Assistant UI already has hard-coded `goKeys` / `goSpaces` / `goEdit` and `ui: subscribePanel`. Product pages and query keys exist in `app.json` + page `onLoad`, but nothing is model-addressable.

Constraints: single write model unchanged; no NL keyword routers; whitelist paths only; V3 history/查库正交。

## Goals / Non-Goals

**Goals:**
- Code registry of product pages + query contracts
- One capability `page.get` for lazy fetch and optional validated open → `navLinks`
- Client renders taps; server never invents off-registry URLs

**Non-Goals:**
- Second capability id solely for open
- Putting full page docs in every system prompt
- Auto-jump without member tap
- Registering demo / chat / pockets-as-primary (pockets MAY stay out until product entry exists)
- Client fabricating navigate from model free text

## Decisions

### 1. Single id `page.get` (not `page.open`)
- **Choice:** One capability; `pageId` optional; `open: true` + `query` for navLinks.
- **Why:** User asked for one capability and progressive fetch; mirrors `knowledge.get` while still shipping buttons.
- **Alt:** Separate `page.open` — clearer verbs, but two catalog rows for one concern.

### 2. Registry in cloud function code (`ai/pages/`), not DB
- **Choice:** Like `knowledge/` packs; bump module version with seed; no `aiPages` collection in v1.
- **Why:** Paths change with releases; members must not edit; avoid sync drift with `app.json`.
- **Alt:** `aiCapabilities`-style doc — overkill until multi-app sharing.

### 3. Prompt surface
- **Choice:** Only capability hint in `{{CAPABILITIES}}`; no `{{PAGES_INDEX}}` every turn. After successful get (non-open), inject body and optional one replan (same pattern as knowledge).
- **Why:** “等大模型主动调用获取”; save tokens.
- **Alt:** Always inject short index — easier discovery, more tokens.

### 4. Initial page set (product path only)
| pageId | path | required query | optional |
|--------|------|----------------|----------|
| `items.list` | `/pages/items/index` | — | — |
| `items.edit` | `/pages/items/edit` | — | `id`, `spaceId`, `name`, `quantity`, `unit`, `note`, `spaceName`, `locationName`, `expireDate`, `productionDate` |
| `items.detail` | `/packageBrowse/items/detail` | `id` | — |
| `spaces.list` | `/packageBrowse/spaces/index` | — | — |
| `spaces.detail` | `/packageBrowse/spaces/detail` | `id` | `name` |
| `family.home` | `/pages/family/index` | — | — |
| `family.tags` | `/pages/family/tags` | — | — |
| `family.messages` | `/pages/family/messages` | — | — |
| `ai.keys` | `/packageAi/keys/index` | — | — |
| `onboarding` | `/pages/onboarding/index` | — | `inviteCode` |

Exclude: `packageDemo/*`, chat, `pockets` (no product entry yet). Tab vs navigate: none of the above are tabBar today → all `navigateTo` (or `reLaunch` only if later marked).

### 5. Response shape
```
{ ok, summary, pages? | page?, ui?: 'navLinks', navLinks?: [{ label, url, pageId }] }
```
- Fetch: `pages` (index) or `page` (one contract) → orchestrator injects text for replan.
- Open: `ui: 'navLinks'` + links; presentation may add a short lead; no ledger write.

### 6. Client
- Render `navLinks` like existing text-links; `wx.navigateTo({ url })` with fail toast.
- Persist: strip navLinks on cold restore (same as chips/confirm).

## Risks / Trade-offs

- [Model opens without get] → Allowed if query valid; registry still enforces. Hint soft-encourages get first for unfamiliar pages.
- [Stale registry vs app.json] → Tasks include checklist against `app.json`; review on page add.
- [Over-open spam] → Cap opens per act (e.g. ≤3), like knowledge get cap.
- [id from short ref] → Model must use real itemId only if present in FOCUS/PROBE machine facts or prior tool results; short refs F*/P* are for item.* tools, not raw detail URLs unless executor maps ref→id when open (optional enhancement). **v1:** query `id` must be a real document id already visible in this-turn focus/probe/tool payload; executor MAY resolve `ref: F1` → id when opening item detail. Prefer resolving ref in tool to avoid model pasting _id from thin air.

**Decision addendum:** For `items.detail` / `items.edit` with `id`, allow `ref` (F*/P*) instead of raw id; executor resolves via current-turn focus/probe maps. Reject unresolved refs.

## Migration Plan

1. Ship cloud `ai` with new capability version + handler.
2. Ship `packageAiAssist` that understands `navLinks`.
3. Old clients ignore unknown ui → degrade to summary text only (acceptable).
4. Rollback: disable `page.get` in seed (`enabled: false`) and redeploy.

## Open Questions

- Whether to later add `pockets` once product entry exists (no behavior change now).
