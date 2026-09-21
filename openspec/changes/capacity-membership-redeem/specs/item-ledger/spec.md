## MODIFIED Requirements

### Requirement: Members can create update and remove items
Authenticated members of the current family SHALL create, update, and hard-delete items in that family through the item domain write API. Deletion is hard delete (no soft-delete of the item document). Activity history for deletes is a separate capability. Creating one or many items MUST enforce the current family’s effective item capacity limit (free plan default fifty, or active capacity subscription). The system MUST maintain a per-family item count used for that check and MUST NOT rely on listing all items on every create. Batch create MUST fail entirely when the batch would exceed remaining capacity.

#### Scenario: Create item
- **WHEN** a member of the current family creates an item with a valid name and the family is under its effective item limit
- **THEN** the system stores the item under that family, records `createdBy` as the caller's openid, sets `source` to `ui` unless an Agent or AI-capture caller sets `agent`, and increments the family’s item count

#### Scenario: Reject create at free capacity
- **WHEN** a member without an active capacity subscription attempts to create an item that would exceed the free item limit of fifty
- **THEN** the system denies the create with a capacity error and does not store the item

#### Scenario: Create allowed with active capacity plan
- **WHEN** a member of a family with an active capacity subscription creates an item within that plan’s limit (or unlimited)
- **THEN** the system stores the item and increments the family’s item count

#### Scenario: Batch create over remaining capacity fails entirely
- **WHEN** a member submits a batch create whose size exceeds the family’s remaining item capacity
- **THEN** the system rejects the whole batch and does not partially insert items

#### Scenario: Update item in current family
- **WHEN** a member updates name, quantity, and/or note of an item that belongs to their current family
- **THEN** the system applies the changes and updates `updatedAt`

#### Scenario: Reject update for other family's item
- **WHEN** a member attempts to update an item whose `familyId` is not their current family
- **THEN** the system denies the update

#### Scenario: Hard delete
- **WHEN** a member removes an item that belongs to their current family
- **THEN** the item document is permanently deleted and the family’s item count decreases by one without going negative
