## MODIFIED Requirements

### Requirement: Names map through the tree then existing writes
The executor MUST resolve space, location, and tag names against the current structure tree. A missing location under a matched space MAY be created through the existing location-create API when that capability is enabled. Item create, **createMany**, update, and remove MUST go through the existing item domain write API with source agent. The assistant MUST NOT duplicate item validation in a second write implementation.

#### Scenario: Confirmed create becomes a ledger item
- **WHEN** a valid create step for 牛奶 in 厨房 / 冰箱 runs for the current family
- **THEN** an item document is written via the item cloud write path with source agent

#### Scenario: Batch createMany becomes ledger items
- **WHEN** a valid createMany step lists two items with resolvable space names for the current family
- **THEN** both item documents are written via the item domain createMany path with source agent and the system does not invent a parallel write implementation inside the assistant

#### Scenario: Unmatched space is not auto-created
- **WHEN** a create or createMany step names a space that is not on the structure tree
- **THEN** the system does not create a new space

### Requirement: Default create not merge
When the utterance does not explicitly ask to merge, a create or createMany step MUST insert new item rows even if same-named items already exist at that place. After successful single creates, the operation report MAY list possible duplicates at the same space and location. createMany MAY omit per-row database duplicate scans. The system MUST NOT merge items unless the member explicitly confirms a merge capability.

#### Scenario: Second milk is a new row
- **WHEN** 厨房 / 冰箱 already has 牛奶 and the member says to put two bottles of milk in the fridge without asking to merge
- **THEN** the system creates another item rather than increasing the existing quantity

#### Scenario: Same name creates another row
- **WHEN** 牛奶 already exists in 厨房 / 冰箱 and the plan creates 牛奶 there again without asking to merge
- **THEN** the system creates another item rather than increasing the existing quantity

## ADDED Requirements

### Requirement: Multi-item plans prefer createMany
When the member asks to record two or more new items in one turn and spaces are resolvable, the model SHOULD emit a single `item.createMany` call with an items array rather than multiple `item.create` calls. A single new item MAY still use `item.create`.

#### Scenario: Two spaces two items one call
- **WHEN** the member asks to add one item in 厨房 and one in 客厅 and both spaces are on the tree
- **THEN** a conforming plan uses item.createMany with two entries (or equivalent one-step batch) rather than requiring two separate item.create tool steps for optimality

### Requirement: createMany is all-or-nothing
If any entry in a createMany batch fails validation (missing name, unknown space, invalid date, over the batch limit), the system MUST write zero item documents for that step and MUST report failure.

#### Scenario: One bad row blocks the batch
- **WHEN** createMany includes one valid row and one row whose spaceName is not on the tree
- **THEN** neither row is written
