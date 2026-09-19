## ADDED Requirements

### Requirement: Batch create spaces and locations
Authenticated members SHALL be able to create multiple spaces via `createMany` and multiple locations via `createLocationMany` on the space domain API. Each batch MUST validate every row before writing any document. On success the family structure tree MUST be rebuilt once.

#### Scenario: Valid space batch
- **WHEN** a member calls createMany with two valid space names
- **THEN** the system stores two spaces under the current family

#### Scenario: Valid location batch
- **WHEN** a member calls createLocationMany with two valid location payloads under existing spaces
- **THEN** the system stores two locations and does not leave the structure tree stale after a successful write

#### Scenario: Over limit
- **WHEN** a batch includes more than 20 rows
- **THEN** the system rejects without writing
