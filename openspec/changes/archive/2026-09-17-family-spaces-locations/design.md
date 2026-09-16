## Context

See proposal.md for motivation. MVP ledger is live: `users` / `families` / `memberships` / `items`, cloud functions `family` + `item`, pages onboarding / items / family. Authoritative next-version scope: `docs/plans/2026-09-10-next-spaces-locations.md`. Same constraints apply: document DB only, no nested trees in `families`, UI and future Agent share one write path.

## Goals / Non-Goals

**Goals:**
- Add `spaces` / `locations` collections, indexes, and client-write-deny rules
- Cloud function `space` for spatial CRUD + ensure-default warehouse; extend `item` for `spaceId` / `locationId`
- Edit/create item UI for space + optional location; lazy default「仓库」
- Space list + space detail (default atmosphere image) + family-page entry
- Keep family-wide item list as primary path; dissolve cleans spatial docs

**Non-Goals:**
- Floors UI / `floors` CRUD (field `floorId` optional on spaces only)
- User-uploaded space photos, hotspot pins, 3D, official room packs, icon layout editor
- Required space filter on the family-wide list (optional stretch)
- Parallel spatial model inside `agent/`

## Decisions

### 1. Separate collections, not embedded trees
- **Choice:** `spaces` and `locations` as top-level collections; items reference by id.
- **Why:** Matches MVP anti-nesting rule; supports list/pagination and concurrent edits.
- **Alternatives:** Embed spaces under `families` (rejected); single `places` collection with type discriminator (more filter complexity, deferred).

### 2. Dedicated `space` cloud function
- **Choice:** New `space` function with actions: `list`, `create`, `update`, `remove`, `ensureDefault`, `createLocation`, `updateLocation`, `removeLocation`, `listLocations`. Uniform `{ ok, data | code, message }`.
- **Why:** Keeps `item` focused on ledger writes; Agent can map space tools separately later.
- **Alternatives:** Fold into `family` (heavier family surface); fold into `item` (wrong domain).

### 3. Lazy default warehouse on item create
- **Choice:** `item.create` (and optionally `space.ensureDefault`) creates「仓库」with `isDefault: true` only when the family has zero spaces; then assigns that `spaceId`.
- **Why:** 「先记账后整理」— no forced setup before first item.
- **Alternatives:** Create warehouse on family create (extra write for unused families); require user to create a space first (rejects product principle).

### 4. Default warehouse and space delete policy
- **Choice:** Default warehouse (`isDefault`) may be renamed but MUST NOT be deleted (`DEFAULT_SPACE`). Deleting a non-default space migrates its items to the default warehouse, clears `locationId`, then removes locations under that space. Deleting a location only clears `locationId` (items stay in the same space). Also refuse deleting the last space (`LAST_SPACE`) as a safety net.
- **Why:** Always keep a stable fallback home for items; cascade is 位置 → 空间 → 仓库.
- **Alternatives:** Allow deleting default and promote another space; refuse non-empty space delete.

### 5. Location validity on item update
- **Choice:** If `spaceId` changes, clear `locationId` unless the caller supplies a location that belongs to the new space. Always verify `location.spaceId === item.spaceId` and same `familyId`.
- **Why:** Prevents cross-space location pointers.
- **Alternatives:** Auto-keep location across spaces (invalid); allow dangling locationId (bad reads).

### 6. Read path hybrid
- **Choice:** Client may read `spaces` / `locations` / items-by-`spaceId` under membership-scoped security rules; all writes via cloud functions.
- **Why:** Same hybrid as MVP items list.
- **Alternatives:** All reads via cloud functions (extra latency).

### 7. UI surface
- **Choice:** Pages `pages/spaces/index` (list) and `pages/spaces/detail` (atmosphere + inventory); family page module entry; item edit adds pickers (existing spaces +「新建位置」inline via `createLocation`).
- **Why:** Minimal nav; matches plan IA without tab explosion.
- **Alternatives:** Tab bar「空间」(heavier); only filter on items page (loses atmosphere browse).

### 8. Atmosphere background
- **Choice:** One (or few) static asset(s) under mini program package / CDN key via `coverKey`; all spaces share default blur background in v1.
- **Why:** Low cost; no upload pipeline.
- **Alternatives:** Per-space user image (explicit non-goal).

### 9. Existing items without spaceId
- **Choice:** On first read/write touching legacy items, backfill via `ensureDefault` + set `spaceId` in cloud function update/create paths; optional one-shot migrate in `space.ensureDefault` that assigns null-`spaceId` items to default warehouse.
- **Why:** MVP items lack spatial fields; must not break list/edit.
- **Alternatives:** Leave null spaceId (breaks「必填」invariant).

### 10. Dissolve cleanup
- **Choice:** Extend `family` dissolve to delete `spaces` and `locations` for `familyId` alongside items/memberships.
- **Why:** No orphan spatial docs.

## Risks / Trade-offs

- [Lazy warehouse race on concurrent first creates] → Use idempotent ensure (query then create; tolerate rare duplicate and prefer `isDefault` or earliest); optionally unique name+family later.
- [Legacy items missing spaceId] → Backfill on ensureDefault / item update; document console one-shot if needed.
- [Migrate-on-delete may surprise users] → Confirm copy explains items move to default warehouse; default warehouse itself cannot be deleted.
- [Client read rules mis-scoped] → Mirror items: read only when membership matches current family; deny all client writes on spaces/locations.
- [Atmosphere asset size] → Prefer compressed local image; avoid huge full-res photos in package.

## Migration Plan

1. Create `spaces` / `locations` collections; indexes: `spaces.familyId`, `locations.spaceId` (+ `familyId`), `items.familyId+spaceId`, `items.locationId`.
2. Update security rules: spaces/locations client write deny; read limited to members of the item/family context (same pattern as items).
3. Deploy `space` cloud function; deploy updated `item` and `family` (dissolve cleanup).
4. Ship mini program pages + edit pickers + family entry; smoke: first item → 仓库; create 厨房; move item; browse space detail; dissolve cleans spatial data.
5. Rollback: revert mini program build; new collections can remain empty; old clients ignore new fields.

## Open Questions

- Whether family-wide list space filter ships in this change or immediately after (spec allows deferral; tasks mark it optional).
- Exact static asset path / `coverKey` naming for the default atmosphere image (implementation detail at apply time).
