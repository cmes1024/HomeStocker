# family-spaces Specification

## Purpose

Enable household members to register spaces and optional storage locations, keep a default warehouse for frictionless item entry, and browse items by space without replacing the family-wide ledger.

## Requirements

### Requirement: Spaces and locations are independent collections
Spaces and locations MUST be stored in dedicated document collections keyed by `familyId` (and `spaceId` for locations). They MUST NOT be nested as large arrays inside family documents.

#### Scenario: Space belongs to family
- **WHEN** a member creates a space named「厨房」
- **THEN** the system stores a space document with that family's `familyId` and the given name

#### Scenario: Location belongs to space
- **WHEN** a member creates a location「右边第一个柜子」under an existing space in their current family
- **THEN** the system stores a location document with that `familyId`, `spaceId`, and name

### Requirement: Default warehouse when no spaces exist
The system MUST ensure every item can resolve to a space. When the current family has no spaces, the first item create (or an explicit ensure-default action) MUST lazily create a default space named「仓库」marked as the default. The default space MAY be renamed and MUST NOT be deletable (`DEFAULT_SPACE`). Deleting a location MUST clear `locationId` on attached items while keeping them in the same space. Deleting a non-default space MUST migrate that space's items to the family's default warehouse, clear their `locationId`, and remove locations under the deleted space. The system MUST NOT allow deleting the last remaining space.

#### Scenario: First item creates default warehouse
- **WHEN** a member creates an item and the family has no spaces yet
- **THEN** the system creates a default space「仓库」, assigns the item to it, and persists `spaceId` on the item

#### Scenario: Rename default warehouse
- **WHEN** a member renames the default space from「仓库」to another name
- **THEN** the space keeps serving as the family's default space identity and existing items remain attached by `spaceId`

#### Scenario: Refuse deleting default warehouse
- **WHEN** a member attempts to delete the space marked `isDefault`
- **THEN** the system denies the deletion with `DEFAULT_SPACE` so the family always keeps a default warehouse (rename only)

#### Scenario: Delete location keeps item in space
- **WHEN** a member deletes a location that still has items
- **THEN** those items keep the same `spaceId` and have `locationId` cleared

#### Scenario: Delete space migrates items to warehouse
- **WHEN** a member deletes a non-default space that still has items
- **THEN** those items move to the default warehouse, their `locationId` is cleared, and the space plus its locations are removed

#### Scenario: Refuse deleting last space
- **WHEN** a member attempts to delete the only space in the family
- **THEN** the system denies the deletion so the family is never left without a space

### Requirement: Members can create update and remove spaces and locations
Authenticated members of the current family SHALL create, rename, and remove spaces and locations for that family through the space domain write API. Client SDK direct writes to `spaces` and `locations` MUST be denied.

#### Scenario: Create custom space
- **WHEN** a member creates a space with a non-empty name in their current family
- **THEN** the system stores the space under that family

#### Scenario: Create location in space
- **WHEN** a member creates a location under a space that belongs to their current family
- **THEN** the system stores the location linked to that space

#### Scenario: Reject location under other family's space
- **WHEN** a member attempts to create or update a location whose `spaceId` is not in their current family
- **THEN** the system denies the operation

#### Scenario: Direct client write blocked
- **WHEN** a client attempts to add or update a `spaces` or `locations` document via database SDK write
- **THEN** the security rules deny the write

### Requirement: Items carry space and optional location
Every item MUST have a `spaceId` belonging to the same family. `locationId` is optional; when present it MUST belong to that `spaceId` and family. Item create and update MUST validate these constraints via the item domain write API using server-resolved `currentFamilyId` and membership.

#### Scenario: Create item with selected space and location
- **WHEN** a member creates an item choosing an existing space and an existing location in that space
- **THEN** the item is stored with that `spaceId` and `locationId`

#### Scenario: Create item with space only
- **WHEN** a member creates an item with a space but no location
- **THEN** the item is stored with `spaceId` set and `locationId` empty or absent

#### Scenario: Move item between spaces
- **WHEN** a member updates an item's space to another space in the same family
- **THEN** the system updates `spaceId` and clears or replaces `locationId` so it remains valid for the new space

#### Scenario: Reject location from another space
- **WHEN** a member assigns a `locationId` that belongs to a different space than the item's `spaceId`
- **THEN** the system denies the update

### Requirement: Browse spaces and space detail inventory
Members SHALL open a family entry to a list of spaces for the current family, then open a single space to see that space's items. Each listed item MUST show its location name when a location is set. The space detail view MUST use a product-provided default atmosphere background (shared across spaces is allowed), not require user-uploaded photos.

#### Scenario: Enter space list from family
- **WHEN** a member taps the family-space entry on the family page
- **THEN** the system shows spaces registered for the current family

#### Scenario: Open space detail
- **WHEN** a member opens a space from the list
- **THEN** the system shows items where `spaceId` equals that space, with location names displayed when present, over the default atmosphere background

#### Scenario: Empty space still browsable
- **WHEN** a member opens a space that has no items
- **THEN** the system shows the space detail with an empty inventory state

### Requirement: Family-wide ledger remains primary
The family-wide item list and create/edit flows MUST remain available as the default daily path. Space browsing MUST NOT replace or duplicate inventory into a second stock model. The family-wide list MUST allow filtering by space.

#### Scenario: Family-wide list still works after spaces exist
- **WHEN** a member opens the family-wide items page after spaces and locations have been created
- **THEN** the system still lists all current-family items in one ledger

#### Scenario: Filter ledger by space
- **WHEN** a member picks a space on the family-wide ledger
- **THEN** the list shows only items in that space

### Requirement: Identity and family from server context for space writes
Space and location write actions MUST resolve the caller via cloud `OPENID`, then `currentFamilyId` plus membership. Client-supplied openid or familyId MUST NOT override authorization.

#### Scenario: Create space uses currentFamilyId
- **WHEN** a member calls space create without a trusted familyId (or with a forged familyId)
- **THEN** the space is created under the caller's server-resolved `currentFamilyId` after membership checks

### Requirement: Family dissolve cleans spaces and locations
When a family is dissolved, spaces and locations for that `familyId` MUST be removed along with items and memberships so no orphan spatial data remains.

#### Scenario: Dissolve removes spaces and locations
- **WHEN** the owner dissolves the current family
- **THEN** spaces and locations for that family are deleted with the rest of the family cleanup
