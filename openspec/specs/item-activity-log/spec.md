# item-activity-log Specification

## Purpose

Captures who changed household items and when, so collaborative edits leave a durable, queryable trail without soft-deleting the items themselves.

## Requirements

### Requirement: Emit activity on item create
When an item is successfully created for a family, the system MUST append an activity record for that family that identifies the actor (openid), the new item id, the item name at create time, the action type create, and a timestamp. Failed creates MUST NOT write an activity record.

#### Scenario: Successful create leaves a create event
- **WHEN** a family member successfully creates an item
- **THEN** the system stores a create activity for the current family referencing that item and actor

#### Scenario: Failed create leaves no activity
- **WHEN** item create is rejected (validation or authorization failure)
- **THEN** the system does not create an activity record for that attempt

### Requirement: Emit activity on item update
When an item is successfully updated, the system MUST append an update activity for that family with actor, item id, a display name snapshot, timestamp, and a brief summary of changed fields that members can understand (at least which of name / quantity / unit / note / space / location / tags / dates / reminder changed). Updates that apply no effective field change MAY omit an activity record.

#### Scenario: Quantity change is logged
- **WHEN** a member saves an item with a new quantity
- **THEN** the system stores an update activity that indicates quantity changed

#### Scenario: No-op update may skip activity
- **WHEN** a member saves an item with values identical to the existing record
- **THEN** the system MAY skip writing an update activity

### Requirement: Emit activity on item remove
When an item is successfully removed (hard delete), the system MUST append a remove activity that retains enough snapshot data to describe the deleted item in the feed (at least item id and name at delete time). The item document itself MAY be gone after the write.

#### Scenario: Delete leaves a remove event with name snapshot
- **WHEN** a member deletes an item
- **THEN** the system stores a remove activity for the family including the item’s name at deletion time

### Requirement: Family-scoped activity query
Members of a family MUST be able to list recent activities for their current family in reverse chronological order, with a bounded page size. Non-members MUST NOT read another family’s activities. Queries MAY filter by item id for item-scoped history.

#### Scenario: List family feed newest first
- **WHEN** a member requests the activity list for the current family
- **THEN** the system returns that family’s activities ordered from newest to oldest within the requested page limit

#### Scenario: Filter by item id
- **WHEN** a member requests activities for a specific item id in the current family
- **THEN** the system returns only activities for that item that belong to the current family

#### Scenario: Reject cross-family read
- **WHEN** a caller who is not a member of a family attempts to list that family’s activities
- **THEN** the system denies the request and returns no activity rows

### Requirement: Clean up activities on family dissolve
When a family is dissolved (or equivalent full teardown of that family’s domain data), the system MUST delete that family’s activity records along with other family-scoped collections.

#### Scenario: Dissolve removes activities
- **WHEN** a family is dissolved
- **THEN** activity records for that familyId are removed and no longer appear in any member feed
