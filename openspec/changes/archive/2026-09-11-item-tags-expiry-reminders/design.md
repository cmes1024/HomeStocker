## Context

See proposal.md for motivation. Current MVP+spaces model: `items` lack tags and dates; `pages/items/index` is the primary post-onboarding home; item writes go through the `item` cloud function; family writes through `family`. Full PRD has richer expiry/calendar/batch features — B wave is the slim slice from `docs/plans/2026-09-10-next-abcd-roadmap.md`.

Constraints: WeChat native mini program + CloudBase document DB; domain writes only via cloud functions; identity from `OPENID` + membership; do not nest tag catalogs or item arrays inside `families`; keep Agent-compatible actions on the same write paths.

## Goals / Non-Goals

**Goals:**
- Independent `tags` collection + `items.tagIds[]` with cloud-function CRUD
- Optional `productionDate` / `expireDate` on items; derived shelf-life status for UI
- Two-level reminder switches + daily subscribe-message job for 3d / 1d / day-of
- Ledger-top 「即将过期」 module scoped to `currentFamilyId`

**Non-Goals:**
- Persisted `status` enum as source of truth; expiry calendar page; OCR
- Guaranteed delivery if user never authorizes subscribe messages
- Soft-delete / activity feed (C); experimental interaction (D)

## Decisions

### 1. Tags as a separate collection
- **Choice:** New `tags` docs (`familyId`, `name`, `createdAt`, optional `isDefault`) rather than embedding `categories[]` on `families`.
- **Why:** Matches AGENTS.md rule against stuffing domain arrays into `families`; scales with custom tags; delete/rename stays a clear write path.
- **Alternatives:** Embed on `families` (PRD-shaped, violates current model); string tags on items only (no rename/manage).

### 2. Multi-tag via `tagIds[]` on items
- **Choice:** `items.tagIds: string[]` (family-owned ids); validate on `item` create/update; `tag.remove` strips id from items in that family.
- **Why:** Multi-label fits「药品+冷藏相关」without forcing single category; filter with `tagIds` array-contains query.
- **Alternatives:** Single `tagId` / `category` string (simpler, weaker); junction collection (overkill for MVP B).

### 3. Default seed set
- **Choice:** Seed 药品、饮料、工具、衣物 (and optionally 食品、日用品 if needed for parity) once per family via `tag.ensureDefaults` / list path; record `families.tagsSeededAt` (or equivalent) so user deletions are not re-seeded.
- **Why:** Roadmap examples; avoids fighting user cleanup.
- **Alternatives:** Always re-insert missing defaults; ship with no seeds.

### 4. Dates as `YYYY-MM-DD` strings (or Date at midnight UTC with documented convention)
- **Choice:** Store calendar dates as `YYYY-MM-DD` strings in Asia/Shanghai semantics for compare; derive status in client (and optionally Workers) and in the notify job with the same window: expired < today; expiring ∈ [today, today+3]; else normal.
- **Why:** Avoid timezone drift from full timestamps; Workers already reserved from A wave for pure date math if useful.
- **Alternatives:** Persist `status` on write (stale overnight); use Date objects only.

### 5. Reminder model from slimmed PRD
- **Choice:** `items.expireReminderEnabled` default `false`; `families.expireReminderEnabled` default `true`; notify only if both on + `expireDate` set.
- **Why:** Opt-in per item reduces noise; family master kill-switch without deleting dates.
- **Alternatives:** Remind all dated items (noisy); item-only switch (no household mute).

### 6. Subscribe messages + daily trigger
- **Choice:** New cloud function `expireNotify` (name flexible) on a daily timer; query candidates by `familyId` + `expireDate` in {today, today+1, today+3} and reminder flags; send via WeChat subscribe message API using configured `tmplIds`. Client calls `wx.requestSubscribeMessage` when enabling item reminder or from a light prompt on the expiring module.
- **Why:** Matches PRD windows; CloudBase timer is the natural place; client cannot push reliably alone.
- **Alternatives:** Only in-app module (no push); per-open client checks (no true reminder).

### 7. Who receives the push
- **Choice:** Send to members of the item's family who have an unused subscribe authorization / stored preference record when available; minimum viable: attempt send to members with a recorded `subscribeExpire` grant on `users` or `memberships` (pick one in apply — prefer `memberships` for per-family opt). Document that without prior `requestSubscribeMessage` accept, send is skipped.
- **Why:** Subscribe messages are one-shot / quota-limited; need a place to know who opted in.
- **Alternatives:** Only notify the member who enabled the switch (misses co-stewards); notify all members blindly (high failure rate).

### 8. Home module placement
- **Choice:** Embed 「即将过期」 on `pages/items/index` (ledger home), not a new tab. Data via `item.listExpiring` (or list + client filter for small households; prefer cloud filter with `expireDate` index for correctness).
- **Why:** Roadmap「首页」= primary ledger; avoids new IA.
- **Alternatives:** Separate home page; only filter chip without module.

### 9. Cloud function split
- **Choice:** New `tag` cloud function for tag CRUD + ensureDefaults; extend `item` for `tagIds` / dates / reminder; extend `family` for master switch (+ tagsSeededAt); new `expireNotify` for timer. Keep dissolve/leave cleaning tags for that family.
- **Why:** Same pattern as `space` / `item` / `family` separation.
- **Alternatives:** Fold tags into `item` or `family` (muddier API).

## Risks / Trade-offs

- [Subscribe template not approved / tmplId missing] → Ship UI + switches + home module first; gate push behind config; document console steps in tasks.
- [User never accepts subscribe prompt] → Home module still works; show gentle re-prompt, never block writes.
- [Timezone edge around midnight] → Fix job + UI to Asia/Shanghai calendar dates; document in collections.md.
- [Deleting tag on large item set] → Batch update / paginated strip in cloud function; accept slower delete.
- [Array-contains filter limitations] → Single-tag filter only in B (spec already one tag); multi-tag AND later.

## Migration Plan

1. Create `tags` collection + indexes; extend `items` / `families` fields (additive, nullable/defaults).
2. Deploy `tag` + updated `item` / `family`; backfill not required (empty tagIds, no dates).
3. Ship UI: tag manage, edit/detail fields, ledger filter, expiring module.
4. Apply subscribe template + deploy `expireNotify` timer; verify dry-run logs before enabling sends.
5. Update `collections.md`, acceptance checklist, `AGENTS.md` pointer to B as current focus (until C).

## Open Questions

- Exact WeChat subscribe template copy / field mapping — finalize at apply with MP admin.
- Whether seed list adds 食品 / 日用品 beyond the four roadmap examples — decide in apply without changing specs if still「小套默认标签」.
