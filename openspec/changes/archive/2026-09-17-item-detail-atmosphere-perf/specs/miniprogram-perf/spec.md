## Purpose

Improve mini program startup and runtime cost by shipping non-critical pages in subpackages with async loading first, then applying lightweight client optimizations, then introducing workers for off-main-thread work where beneficial.

## ADDED Requirements

### Requirement: Non-critical pages use subpackages
Space browsing pages and the item detail page MUST be loadable via subpackages (or equivalent delayed package loading) so they are not required in the main package critical path for the family ledger. Navigation to those pages MUST continue to work via normal page routing.

#### Scenario: Open space list from family
- **WHEN** a member opens the family spaces list from the family settings entry
- **THEN** the spaces package loads as needed and the spaces list is shown

#### Scenario: Open item detail from ledger
- **WHEN** a member opens an item detail from the ledger
- **THEN** the detail page loads (from its package) and shows the item

### Requirement: Performance work follows ordered phases
Implementation MUST apply performance work in this order: (1) subpackages and async loading of non-critical paths, (2) lightweight optimizations such as reduced unnecessary state updates, silent list refresh where appropriate, and atmosphere image compression before upload, (3) workers for suitable pure computation. Phase (3) MUST NOT block shipping phases (1) and (2).

#### Scenario: Workers after lighter wins
- **WHEN** the team lands A-wave performance work
- **THEN** subpackages/async and lightweight optimizations are done before or without requiring workers, and workers are introduced only after those earlier steps (or explicitly deferred with a recorded follow-up)
