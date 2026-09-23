## Purpose

Gives the household assistant a code-owned product page registry so the model can lazily fetch page ids, paths, and query contracts, then optionally emit validated jump buttons without inventing URLs.

## ADDED Requirements

### Requirement: Code-owned product page registry
The assistant MUST maintain a versioned, code-seeded registry of product pages the assistant may describe or open. Each entry MUST include a stable page id, mini-program path, human hint, and a query contract (required and optional keys). Demo and legacy chat routes MUST NOT appear in the registry.

#### Scenario: Registry lists item detail with id
- **WHEN** the registry is loaded for assistant use
- **THEN** it includes an entry for item detail whose required query includes `id`

#### Scenario: Demo routes excluded
- **WHEN** the registry is loaded for assistant use
- **THEN** it does not include `packageDemo` or legacy `pages/chat` routes

### Requirement: page.get fetches registry progressively
The capability catalog MUST expose an enabled `page.get` action. When the plan calls `page.get` without a page id, the system MUST return a compact index of page ids and hints for the model. When the plan calls `page.get` with a known page id, the system MUST return that entry’s path and query contract. Unknown page ids MUST fail without inventing a path. The system MUST NOT inject the full registry body into every act prompt by default.

#### Scenario: Index without pageId
- **WHEN** a plan step uses `page.get` with no pageId
- **THEN** the act report includes a compact list of registered page ids and hints for the model

#### Scenario: Detail for one page
- **WHEN** a plan step uses `page.get` with pageId for item detail
- **THEN** the act report includes that page’s path and that `id` is required in query

#### Scenario: Unknown pageId refused
- **WHEN** a plan step uses `page.get` with a pageId not in the registry
- **THEN** that step fails and no navigation UI is emitted

### Requirement: Optional open emits validated nav links
When `page.get` includes `open: true` (or equivalent) with a registered pageId and query object, the system MUST validate query keys against that page’s contract, build a whitelist navigate URL, and return a UI directive of type nav links. Missing required query keys or unknown keys MUST fail the step without emitting a link. The system MUST NOT execute navigation server-side; only the client may navigate after the member taps a returned link.

#### Scenario: Open item detail with id
- **WHEN** a plan step opens item detail with a valid item `id` query
- **THEN** the act response includes a nav link whose URL is the registered detail path with that id

#### Scenario: Missing required query blocks open
- **WHEN** a plan step opens item detail without `id`
- **THEN** the step fails and no nav link is returned

#### Scenario: Invented path refused
- **WHEN** a plan step asks to open a path or pageId outside the registry
- **THEN** the system does not emit a nav link for that path
