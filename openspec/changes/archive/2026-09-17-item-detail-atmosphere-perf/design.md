## Context

See proposal.md for motivation. Current ledger taps open `pages/items/edit`; long-press deletes. Family `updateBackground` stores cloud file ids for photos without deleting the previous file. Spaces pages live in the main package alongside the ledger. Confirmed product decisions are in `docs/plans/2026-09-10-next-a-item-detail-perf.md`.

Constraints: WeChat native mini program + CloudBase; item/family writes stay on cloud functions; no new parallel write models.

## Goals / Non-Goals

**Goals:**
- Detail-first item browsing with edit/delete only from detail
- Best-effort atmosphere file cleanup on replace and leave/dissolve
- Measurable package split + ordered perf improvements

**Non-Goals:**
- Tags, expiry, subscribe messages, activity feed (B/C)
- Guaranteed orphan file GC / periodic scan
- Redesigning AppShell or theme system beyond cleanup hooks

## Decisions

### 1. Detail page location
- **Choice:** New `pages/items/detail` in a subpackage (e.g. with spaces or a dedicated `packageItem` / `packageBrowse`).
- **Why:** Keeps main package lighter; matches perf phase 1.
- **Alternatives:** Keep detail in main package (simpler nav, worse size).

### 2. List interaction
- **Choice:** Tap → detail only; remove long-press delete entirely.
- **Why:** Confirmed product choice; avoids accidental deletes.
- **Alternatives:** Keep long-press delete; action sheet on long-press.

### 3. Atmosphere delete placement
- **Choice:** Inside `family` cloud function on `updateBackground`, `leave`, and dissolve paths; `cloud.deleteFile` best-effort after DB success (or after deciding old file id is unused).
- **Why:** Single write authority; client must not be trusted to clean storage alone.
- **Alternatives:** Client-only delete after update (racey / incomplete on leave).

### 4. Perf sequencing
- **Choice:** Subpackages + async → light client opts → workers last.
- **Why:** Confirmed order; workers have higher debug cost.
- **Alternatives:** Workers early; light-only without subpackages.

### 5. Upload compression
- **Choice:** Compress atmosphere images on client before upload (max edge / quality caps) as part of phase 2.
- **Why:** Reduces storage and download cost immediately.
- **Alternatives:** Server-side transform only (not available simply on CloudBase storage).

## Risks / Trade-offs

- [deleteFile fails silently] → Log + accept orphan; optional later GC.
- [Subpackage cold start on first open] → Accept first-nav delay; preload optional later.
- [Workers limited value before B expiry math] → Ship a thin worker hook or defer with note in tasks if no strong candidate.

## Migration Plan

1. Ship detail page + list nav change; remove long-press.
2. Deploy updated `family` with storage cleanup.
3. Move spaces + detail into subpackages; verify routes.
4. Land compression + setData/silent refresh polish.
5. Add worker only if a clear pure-compute path exists; else document deferral.

## Open Questions

- Exact subpackage name grouping (`packageSpaces` vs combined browse package) — decide at apply by `app.json` size.
- Whether edit page stays in main package — prefer yes for write latency unless size forces move.
