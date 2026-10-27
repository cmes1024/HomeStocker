## ADDED Requirements

### Requirement: Write capabilities declare itemId and provenance arguments

Capability entries for item update, remove, removeMany, and merge MUST declare both the short-ref argument and an optional `itemId` argument, and MUST declare the `_src` provenance object. The seeded catalog version MUST be bumped so an existing deployment receives the new arguments without manual SQL.

#### Scenario: Catalog shows itemId

- **WHEN** the enabled catalog is rendered into the prompt
- **THEN** item update and item remove list `itemId` alongside `ref`, and list `_src`

#### Scenario: Seed upgrades in place

- **WHEN** the server starts with an older seeded version
- **THEN** the catalog is updated to the new version automatically

### Requirement: Grounding feedback codes are catalogued

The capability knowledge MUST document the grounding codes the executor can return, so the model can react to a code without needing a natural-language explanation. The documented set MUST cover ungrounded place, ungrounded quantity, unknown ref, ambiguous ref, missing name match, missing inference basis, held write, and required clarification.

#### Scenario: Model sees the code list

- **WHEN** the capability knowledge is injected
- **THEN** it names each grounding code and the field that accompanies it
