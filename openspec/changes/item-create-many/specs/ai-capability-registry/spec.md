## MODIFIED Requirements

### Requirement: V2 enabled actions
The enabled catalog MUST include item search, list expiring, create, **createMany**, update, and remove, plus creating a location under an existing space. Item remove MUST require explicit member confirmation before execution. `item.createMany` MUST be described so the model can record multiple new ledger rows in one plan step.

#### Scenario: Remove requires confirmation
- **WHEN** a plan includes item remove and the member has not confirmed that remove
- **THEN** the system does not delete the item

#### Scenario: createMany is listed when enabled
- **WHEN** the catalog marks item createMany as enabled
- **THEN** the model-facing capability list includes item createMany with an items-array argument hint
