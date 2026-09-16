## MODIFIED Requirements

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
