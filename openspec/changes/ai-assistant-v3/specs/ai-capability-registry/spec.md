## ADDED Requirements

### Requirement: Catalog presentation stays discoverable with tools
The capability catalog MUST remain the single enablement list shared by prompt text and the executor. Tool handlers and catalog entry ids MUST stay name-aligned so every enabled id has exactly one execution path. Scenario-oriented prompt sections MAY reference capability ids by the same ids shown in the catalog; they MUST NOT introduce shadow tool names that the executor does not implement.

#### Scenario: Enabled id has one handler
- **WHEN** the catalog lists an enabled capability id
- **THEN** the assistant tool runtime exposes exactly one mapped handler for that id (or the id is hard-denied and never executed)

## MODIFIED Requirements

### Requirement: V2 enabled actions
The enabled catalog MUST include item search, list expiring, create, createMany, update, remove, removeMany, merge when enabled, creating a location under an existing space, **creating a space**, **space createMany**, and **space createLocationMany**, plus other currently shipped enabled structure and tag actions already in production. Item remove and removeMany MUST require confirmation. Disabled entries MUST NOT appear in the model-facing list. V3 MUST NOT shrink the production-enabled set solely for cleanup; removals require an explicit catalog version decision.

#### Scenario: Remove requires confirmation
- **WHEN** a plan includes item remove and the member has not confirmed that remove
- **THEN** the system does not delete the item

#### Scenario: createMany is listed when enabled
- **WHEN** the catalog marks item createMany as enabled
- **THEN** the model-facing capability list includes item createMany with an items-array argument hint

#### Scenario: space.create is listed when enabled
- **WHEN** the catalog marks space.create as enabled
- **THEN** the model-facing capability list includes space.create

#### Scenario: batch structure ids are listed
- **WHEN** space.createMany and space.createLocationMany are enabled
- **THEN** both appear in the model-facing capability list with array argument hints
