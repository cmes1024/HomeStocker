## Context

See proposal.md for motivation. After B wave, `item` cloud function owns create/update/remove; items are hard-deleted; family page is the hub for spaces/tags/reminders/background. Constraints unchanged: CloudBase document DB; no nesting activity arrays inside `families`; identity from `OPENID` + membership; UI and future Agent share the same `item` write path.

## Goals / Non-Goals

**Goals:**
- Independent `activities` collection written only from successful item mutations
- Membership-gated list (family feed + per-item recent)
- Family-page message UI + detail recent-ops; dissolve cleans activities

**Non-Goals:**
- Soft-delete / restore of items
- Logging space/tag/family/background/membership events in C
- Push notifications for activity
- Client-direct writes to `activities`
- Full field-level before/after audit dump in UI (brief summary is enough)

## Decisions

### 1. Separate `activities` collection
- **Choice:** New docs with `familyId`, `itemId`, `action` (`create`|`update`|`remove`), `actorOpenid`, `itemName`, optional `summary` / `changedFields[]`, `source` (`ui`|`agent`), `createdAt`.
- **Why:** Matches anti-nesting rule; supports `familyId+createdAt` and `itemId+createdAt` indexes; survives item hard delete via name snapshot.
- **Alternatives:** Embed last-N on `families` (rejected); soft-delete items and read history from item docs (out of C scope / heavier).

### 2. Write activities inside `item` cloud function
- **Choice:** After successful create/update/remove DB write, insert one activity in the same request. Prefer best-effort: if activity insert fails, log and still return item success (or document transactional preference in apply — default **item success wins** so ledger never blocks on feed).
- **Why:** Single write entry for UI and Agent; no second client call that can be skipped.
- **Alternatives:** Separate `activity.append` client call (easy to forget); DB trigger (CloudBase triggers less portable / harder to test).

### 3. Dedicated `activity` cloud function for reads
- **Choice:** New `activity` function with `list` (params: optional `itemId`, `limit`, `cursor`/`skip`). Auth: resolve `currentFamilyId` + membership. Writes denied to clients via security rules.
- **Why:** Keeps `item` focused on ledger; mirrors `tag` / `space` split for list concerns.
- **Alternatives:** Fold list into `item.listActivity` (acceptable fallback if we want fewer functions; prefer dedicated for clarity).

### 4. Update summary shape
- **Choice:** On update, diff allowed fields; store `changedFields: string[]` (stable keys) plus optional short Chinese `summary` for display. Skip activity if empty diff.
- **Why:** Spec needs human-readable hints without huge payloads; keys stay stable for copy mapping.
- **Alternatives:** Full before/after JSON (noisy, PII-ish notes); only store 「更新了物资」 with no hint (weaker「人味」).

### 5. Actor display
- **Choice:** Persist `actorOpenid` only; at list time join `users.nickname` when present, else UI fallback「家人」. Do not require nickname on write.
- **Why:** Nickname is optional today; avoids denormalized stale names as source of truth.
- **Alternatives:** Snapshot nickname at write (friendlier offline, can go stale); show truncated openid (ugly).

### 6. Feed placement
- **Choice:** Primary entry on `pages/family` — either an inline recent block +「查看全部」subpage, or a dedicated `pages/family/messages` sibling to tags. Prefer **subpage** if feed grows; inline preview (e.g. last 5) on family home is optional stretch.
- **Why:** Roadmap says「家庭消息」; keeps ledger home uncluttered after B’s expiring module.
- **Alternatives:** New tab bar item (IA churn); only detail history (misses household awareness).

### 7. Pagination
- **Choice:** Default page size ~20–50; newest first; simple skip/limit or createdAt cursor. No infinite historical guarantee beyond practical retention.
- **Why:** Household volume is small; cursor can be refined later.
- **Alternatives:** Load all (fine early, risky later).

### 8. Retention (lightweight)
- **Choice:** No TTL job in C; dissolve deletes by `familyId`. Optional future cap (e.g. keep 500/family) out of scope unless apply discovers cost pressure.
- **Why:** YAGNI; small families.
- **Alternatives:** 90-day TTL now (premature).

## Risks / Trade-offs

- [Activity insert fails after item write] → Accept orphan gap; log error; never roll back successful item mutation by default.
- [Hard delete loses deep field history] → Name + action snapshot on remove; detail recent ops gone with item — family feed still shows remove row.
- [Nickname empty] → Fallback label; consider membership display name later (D / polish).
- [High-chatter edits] → Skip no-op updates; keep summary coarse (field keys not every keystroke).
- [B proposal wording bundled soft-delete with C] → Explicitly out of scope; hard delete + activity snapshot is the C contract.

## Migration Plan

1. Create `activities` collection + indexes; deny client write in `database-rules.json`; document in `collections.md`.
2. Deploy updated `item` (emit activities) + new `activity.list`; extend `family` dissolve cleanup.
3. Ship family messages UI + detail recent ops; wire `callActivity`.
4. No backfill of historical edits before C (feed starts empty — acceptable).
5. Update acceptance checklist + `AGENTS.md` pointer to C as current focus.

## Open Questions

- Whether family home shows a 3–5 row preview above the fold or only a single entry block — decide in apply without changing specs if both still「家庭消息入口」.
- Exact Chinese copy for action verbs — finalize with `utils/copy.js` in apply.
