## Purpose

Stores a per-family structure snapshot of spaces, locations, and tags so the natural-language assistant can see household configuration without embedding inventory in the family document.

## ADDED Requirements

### Requirement: Tree holds structure not inventory
Each current family MUST have at most one structure-tree document keyed by that family. The tree MUST include spaces (with default flag), locations nested under their space, and tag names. The tree MUST NOT include items, quantities, dates, activities, or members.

#### Scenario: Tree lists rooms and places
- **WHEN** a member’s current family has a kitchen space with a fridge location and a drink tag
- **THEN** the structure tree for that family includes kitchen, fridge under kitchen, and the drink tag, and does not list any item names

#### Scenario: Tree is not nested in the family document
- **WHEN** the system stores the structure tree
- **THEN** the family document does not contain the spaces or items arrays used as the tree

### Requirement: Structure writes refresh the tree
After a successful create, update, or remove of a space, location, or tag for a family, the system MUST update that family’s structure tree to match the collections. Item create, update, or remove MUST NOT by itself rewrite the tree.

#### Scenario: New location appears on the tree
- **WHEN** a member creates a location named 冰箱 under 厨房
- **THEN** a later read of that family’s structure tree includes 冰箱 under 厨房

#### Scenario: Adding an item does not change the tree
- **WHEN** a member creates an item in 厨房 / 冰箱
- **THEN** the structure tree’s spaces, locations, and tags remain as they were before that item write

### Requirement: Missing or stale tree is rebuilt
When the assistant needs the tree and the document is missing, unreadable, or known to be stale versus the family’s spaces, locations, and tags, the system MUST rebuild the tree from those collections before using it. Rebuild MUST NOT require the member to resubmit their utterance.

#### Scenario: First assistant call rebuilds an empty tree
- **WHEN** a member with a current family that has spaces but no tree document starts the assistant
- **THEN** the system builds the tree from the family’s spaces, locations, and tags and proceeds with that tree

### Requirement: New family gets a tree
When a family is created and its default space (and default tags if seeded) exist, the system MUST write a structure tree for that family.

#### Scenario: Create home seeds a tree
- **WHEN** a member creates a family and the default warehouse exists
- **THEN** a structure tree document exists for that family id

### Requirement: Dissolve deletes the tree
Dissolving a family MUST delete that family’s structure tree so it is not left attached to a removed household.

#### Scenario: Dissolve removes the tree
- **WHEN** the owner dissolves the family
- **THEN** no structure tree remains for that family id
