## ADDED Requirements

### Requirement: Optimal structure-then-items composition
When a turn needs new spaces, locations, and items, the model SHOULD emit calls in order: spaces, then locations, then items. For each kind, two or more new entities SHOULD use the corresponding createMany capability; a single entity MAY use the singular create capability.

#### Scenario: Two rooms two closets then goods
- **WHEN** the member asks to create 主卧 and 次卧, add 衣柜 under each, and add clothing items there
- **THEN** a conforming plan uses space.createMany, then space.createLocationMany, then item.createMany (or equivalent minimal Many steps) rather than only repeated singular creates

### Requirement: Batch location create through existing write path
space.createLocationMany MUST resolve space names against the current structure tree (including spaces created earlier in the same act after the tree is refreshed) and MUST write through the location domain writer with all-or-nothing validation.

#### Scenario: Location batch fails on unknown space
- **WHEN** createLocationMany names a space not on the tree and not created earlier in the plan
- **THEN** no location documents are written for that step
