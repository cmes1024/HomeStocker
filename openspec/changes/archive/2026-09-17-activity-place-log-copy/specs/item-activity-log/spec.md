## MODIFIED Requirements

### Requirement: Emit activity on item create
When an item is successfully created for a family, the system MUST append an activity record for that family that identifies the actor (openid), the new item id, the item name at create time, the action type create, a timestamp, a snapshot of the space name and location name at write time (location name MAY be empty), and the quantity and unit written on the item. Failed creates MUST NOT write an activity record.

#### Scenario: Successful create leaves a create event
- **WHEN** a family member successfully creates an item
- **THEN** the system stores a create activity for the current family referencing that item and actor

#### Scenario: Failed create leaves no activity
- **WHEN** item create is rejected (validation or authorization failure)
- **THEN** the system does not create an activity record for that attempt

#### Scenario: Create snapshots place and quantity
- **WHEN** a member creates an item in a named space with quantity and unit
- **THEN** the create activity stores the space name, location name if any, quantity, and unit from that write

### Requirement: Emit activity on item update
When an item is successfully updated, the system MUST append an update activity for that family with actor, item id, a display name snapshot, timestamp, a snapshot of the space name and location name after the write (location name MAY be empty), and a brief summary of changed fields that members can understand (at least which of name / quantity / unit / note / space / location / tags / dates / reminder changed). Updates that apply no effective field change MAY omit an activity record.

#### Scenario: Quantity change is logged
- **WHEN** a member saves an item with a new quantity
- **THEN** the system stores an update activity that indicates quantity changed

#### Scenario: No-op update may skip activity
- **WHEN** a member saves an item with values identical to the existing record
- **THEN** the system MAY skip writing an update activity

#### Scenario: Update snapshots place after the write
- **WHEN** a member updates an item that belongs to a named space
- **THEN** the update activity stores the space name and location name as they are after the write

### Requirement: Emit activity on item remove
When an item is successfully removed (hard delete), the system MUST append a remove activity that retains enough snapshot data to describe the deleted item in the feed (at least item id, name at delete time, and the space name and location name at delete time; location name MAY be empty). The item document itself MAY be gone after the write.

#### Scenario: Delete leaves a remove event with name snapshot
- **WHEN** a member deletes an item
- **THEN** the system stores a remove activity for the family including the item’s name at deletion time

#### Scenario: Delete snapshots place
- **WHEN** a member deletes an item that was in a named space
- **THEN** the remove activity stores that space name and location name if any
