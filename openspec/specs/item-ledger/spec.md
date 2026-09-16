# item-ledger Specification

## Purpose

Provide a shared household item ledger with family isolation and a single cloud-function write path reusable by a future Agent. Later capabilities add space, tags, dates, and activity fields onto the same `items` documents.

## Requirements

### Requirement: Item fields for MVP
Each item MUST belong to exactly one family via `familyId` and MUST include `name` (required), `quantity` (number ≥ 0, default 1), and `note` (optional). Items MUST NOT be nested inside family documents. Additional fields added by later capabilities (space, location, tags, dates, source) MUST still live on the same item document, not in a second inventory.

#### Scenario: Create with defaults
- **WHEN** a member creates an item with only a name
- **THEN** the item is stored with `quantity` defaulting to 1, empty or absent note allowed, and `familyId` taken from the caller's current family

### Requirement: Members can create update and remove items
Authenticated members of the current family SHALL create, update, and hard-delete items in that family through the item domain write API. Deletion is hard delete (no soft-delete of the item document). Activity history for deletes is a separate capability.

#### Scenario: Create item
- **WHEN** a member of the current family creates an item with a valid name
- **THEN** the system stores the item under that family, records `createdBy` as the caller's openid, and sets `source` to `ui` unless an Agent or AI-capture caller sets `agent`

#### Scenario: Update item in current family
- **WHEN** a member updates name, quantity, and/or note of an item that belongs to their current family
- **THEN** the system applies the changes and updates `updatedAt`

#### Scenario: Reject update for other family's item
- **WHEN** a member attempts to update an item whose `familyId` is not their current family
- **THEN** the system denies the update

#### Scenario: Hard delete
- **WHEN** a member removes an item that belongs to their current family
- **THEN** the item document is permanently deleted

### Requirement: List and get items for current family
Members SHALL be able to list items for their current family ordered by recent update, and optionally get a single item by id when it belongs to that family. Unauthenticated or non-member users MUST NOT read that family's items.

#### Scenario: List current family items
- **WHEN** a member with a valid current family requests the item list
- **THEN** the system returns items where `familyId` equals the current family, ordered by `updatedAt` descending

#### Scenario: Non-member cannot read family items
- **WHEN** a user who is not a member of family F attempts to read items of family F
- **THEN** the system does not return those items

### Requirement: Search by name for Agent readiness
The item domain API SHALL expose a `search` action that matches items in the caller's current family by name keyword (simple substring match is sufficient). Empty keyword MUST behave as a family list. The ledger UI MAY defer wiring a search box; the API MUST still exist.

#### Scenario: Keyword search in current family
- **WHEN** a member searches with a keyword that appears in an item name in their current family
- **THEN** the system returns matching items limited to that family

### Requirement: Client write deny single write path
Client SDK direct writes to the `items` collection MUST be denied. All item creates, updates, and deletes MUST go through the item cloud function so UI and future Agent share one validation path.

#### Scenario: Direct client write blocked
- **WHEN** a client attempts to add or update an `items` document via database SDK write
- **THEN** the security rules deny the write

### Requirement: Identity and family from server context
Item write and search actions MUST resolve the caller via cloud `OPENID`, then `currentFamilyId` plus membership. Client-supplied openid or familyId MUST NOT override authorization.

#### Scenario: Create uses currentFamilyId
- **WHEN** a member calls item create without supplying familyId (or with a forged familyId)
- **THEN** the item is created under the caller's server-resolved `currentFamilyId` after membership checks
