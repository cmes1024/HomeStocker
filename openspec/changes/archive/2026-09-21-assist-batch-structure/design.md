## Context

`item.createMany` 已落地。结构写仍只有单条 `space.createLocation`，且 `space.create` 对助手 disabled。

## Goals / Non-Goals

**Goals:** Enable assistant space create; add batch space/location writes; prompt optimal composition.

**Non-Goals:** Batch update/remove spaces; UI batch; merge activities.

## Decisions

1. Shared `spaceWrite` module (space CF + ai) with `createSpace` / `createMany`; extend `locationWrite` with `createLocationMany`.
2. All-or-nothing validation; max 20; one `touchFamilyTree` after success (space CF switch + ai tool).
3. Duplicate names: same as single create (no reject).
4. Calls order: spaces → locations → items; ≥2 → Many.

## Risks

- [Risk] Enabling space.create changes prior “cannot create rooms” assistant UX → prompt + capability seed must stay consistent.
