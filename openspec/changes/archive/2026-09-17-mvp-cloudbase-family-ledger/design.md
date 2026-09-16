## Context

See proposal.md for motivation. Baseline is the existing WeChat native `miniprogram/` template (extend / pageRouter / components). Authoritative MVP scope: `docs/plans/2026-09-10-mvp-cloudbase-redesign.md`. No MySQL; document DB only. Agent chat UI is out of scope but write APIs must be tool-shaped.

## Goals / Non-Goals

**Goals:**
- Document collections + indexes + security rules for users / families / memberships / items
- Cloud functions `family` and `item` as the only domain write surface
- Client read helpers + call wrappers; onboarding → items → family pages
- Preserve `chatProxy` shell; keep Agent-ready `source` and `search`

**Non-Goals:**
- Multi-family switch UI, roles, expiry, OCR, purchase list, LangGraph/chat UI
- Soft delete / event audit tables
- Parallel domain model inside `agent/` for this change

## Decisions

### 1. Document DB + association collections
- **Choice:** CloudBase document DB; `memberships` for person↔family; independent `items` with `familyId`.
- **Why:** Native mini program integration; avoids nested-array write conflicts and document size limits.
- **Alternatives:** MySQL (deferred); nest items in `families` (rejected for concurrency/pagination).

### 2. Hybrid read / cloud-function write
- **Choice:** Client may read `items` under security rules; all writes via `item` / `family` cloud functions.
- **Why:** Fast list UX; one validation path for UI and future Agent tools.
- **Alternatives:** All access via cloud functions (more latency); client writes with rules only (Agent drift risk).

### 3. Identity and family resolution
- **Choice:** `getWXContext().OPENID` → `users.currentFamilyId` + membership check; ignore client identity fields.
- **Why:** Prevents forged openid/familyId; matches Agent injection via `chatProxy` later.

### 4. MVP single-family experience on multi-membership model
- **Choice:** Schema allows many memberships; create/join reject with `ALREADY_IN_FAMILY` if any membership exists.
- **Why:** No migration when multi-family UI arrives—only relax the guard and switch `currentFamilyId`.

### 5. Cloud function shape
- **Choice:** Two functions, action dispatch: `family` (create/join/getMyFamily/leave), `item` (create/update/remove/get/search). Uniform `{ ok, data | code, message }`.
- **Why:** Matches planned Agent tool mapping; keeps deploy surface small.

### 6. Code layout
- **Choice:** Trim `app.json` pages; add `pages/onboarding`, `pages/items`, `pages/family`; `utils/db.js`, `utils/cloud.js`, `utils/session.js`; keep `extend/` and Header patterns.
- **Why:** Reuse template infrastructure; remove demo/chat from product path without deleting Agent shell.

### 7. Indexes and invite codes
- **Choice:** Unique `families.inviteCode`; membership indexes on openid, familyId, and unique pair; `items` compound `familyId + updatedAt`. Invite code: length 6, `A-Z0-9`, no auto-rotation.
- **Why:** Join and list queries stay index-backed.

## Risks / Trade-offs

- [Document DB lacks multi-doc transactions] → Keep create/join/leave logic in cloud functions with careful ordering and idempotent membership `_id` (`${openid}_${familyId}`); accept rare counter drift and fix in leave/get if needed.
- [Client read rules misconfigured leaks items] → Restrict read to current family membership; deny client writes entirely on items/memberships/families.
- [Owner dissolve orphan items] → Dissolve path deletes items for that `familyId` in the same cloud function flow.
- [Existing demo users confused] → Product entry no longer registers demo/chat; document in tasks as cleanup.

## Migration Plan

1. Create collections and indexes in CloudBase console (or bootstrap script if present).
2. Deploy security rules (items read-only from client; relationship collections write deny).
3. Deploy `family` and `item` cloud functions; keep `chatProxy` undeployed or as no-op shell.
4. Ship mini program with new pages; smoke dual-account create/join/CRUD/leave.
5. Rollback: redeploy previous mini program build; rules/functions can remain if additive (empty collections).

## Open Questions

- Exact dissolve behavior for last non-owner edge cases if owner already left: treat as N/A for MVP (owner dissolve is the cleanup path); revisit if leave-as-owner without dissolve is exposed in UI.
