# family-message-feed Specification

## Purpose

Shows household members a readable stream of item change events so shared stewardship feels human and timely, without building a chat product.

## Requirements

### Requirement: Family message feed entry
The family surface MUST expose a message / activity feed for the current family that loads from the item activity log. The feed MUST refresh when the member switches families so another family’s events never appear mixed in.

#### Scenario: Open family messages for current home
- **WHEN** a member opens the family message feed while a current family is selected
- **THEN** the system shows recent activity messages for that family only

#### Scenario: Switch family refreshes feed
- **WHEN** a member switches `currentFamilyId` and returns to the message feed
- **THEN** the system shows activities for the newly selected family only

### Requirement: Readable message rows
Each feed row MUST present enough context for a member to understand the event at a glance: actor label, action, item name snapshot, relative or absolute time, and the place snapshot when space or location names were stored. Place copy MUST read as「在{空间}里」or「在{空间}{位置}里」when those names exist. Create and remove rows MUST NOT require quantity. Update rows MUST append `x{quantity}` when a quantity snapshot exists. Missing nickname MUST fall back to a non-empty generic label (for example「家人」) rather than a blank actor. Missing place snapshots MUST still produce a readable row without inventing a place name.

#### Scenario: Create row reads naturally
- **WHEN** the feed contains a create activity with space name and item name
- **THEN** the row identifies who added which item, where, and when (for example「家人在厨房里加入了啤酒」)

#### Scenario: Create row with location
- **WHEN** the feed contains a create activity with both space name and location name
- **THEN** the row includes both place names in a readable phrase (for example「在厨房冰箱里」)

#### Scenario: Update row shows quantity
- **WHEN** the feed contains an update activity with a place snapshot and quantity
- **THEN** the row shows who modified which item, where, and the quantity (for example「家人在厨房里修改了啤酒x5」)

#### Scenario: Remove row still names the item
- **WHEN** the feed contains a remove activity after hard delete with a place snapshot
- **THEN** the row still shows who deleted which item and where (for example「家人在厨房里删除了啤酒」)

#### Scenario: Legacy row without place
- **WHEN** the feed contains an older activity that has no space or location snapshot
- **THEN** the row remains readable using actor, action, and item name without fabricating a place

### Requirement: Empty and error states
When there are no activities yet, the feed MUST show a calm empty state (not an error). Load failures MUST show a recoverable error with retry, without inventing placeholder fake events.

#### Scenario: Empty household feed
- **WHEN** the current family has no activity records
- **THEN** the feed shows an empty-state message and no fabricated rows

#### Scenario: Load failure with retry
- **WHEN** the activity list request fails
- **THEN** the UI shows an error and allows the member to retry

### Requirement: Item detail recent operations
The item detail view MUST show a short recent-operations section for that item (same activity source, filtered by item id). If the item was deleted, detail MAY be unavailable; remove events remain visible on the family feed via snapshot.

#### Scenario: Detail shows recent ops for an existing item
- **WHEN** a member opens detail for an item that has prior create/update activities
- **THEN** the detail shows those recent operations for that item newest first

#### Scenario: Detail with no history yet
- **WHEN** a member opens detail for an item that somehow has no activity rows
- **THEN** the recent-operations section is hidden or shows a brief empty hint without blocking the rest of detail

### Requirement: No social layer in C
The message feed MUST NOT include comments, likes, @mentions, or free-form chat compose. It is a read-only activity stream derived from item writes.

#### Scenario: No compose box
- **WHEN** a member views the family message feed
- **THEN** there is no UI to post arbitrary chat messages unrelated to item writes
