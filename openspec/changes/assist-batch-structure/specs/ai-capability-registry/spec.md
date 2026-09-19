## MODIFIED Requirements

### Requirement: V2 enabled actions
The enabled catalog MUST include item search, list expiring, create, createMany, update, remove, creating a location under an existing space, **creating a space**, **space createMany**, and **space createLocationMany**. Item remove MUST require confirmation. Disabled entries MUST NOT appear in the model-facing list.

#### Scenario: space.create is listed when enabled
- **WHEN** the catalog marks space.create as enabled
- **THEN** the model-facing capability list includes space.create

#### Scenario: batch structure ids are listed
- **WHEN** space.createMany and space.createLocationMany are enabled
- **THEN** both appear in the model-facing capability list with array argument hints
