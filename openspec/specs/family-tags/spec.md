# family-tags Specification

## Purpose

Lets each family maintain shared tags and attach them to items so members can classify and filter the household ledger without a separate inventory system.

## Requirements

### Requirement: Family-scoped tag catalog
The system MUST maintain tags per family (not global and not nested inside the family document as a large array of unrelated domain data beyond the tag records themselves). Members of the family MUST be able to list tags, create a custom tag by name, rename a tag, and delete a tag they no longer need.

#### Scenario: Create custom tag
- **WHEN** a member creates a tag with a non-empty name in the current family
- **THEN** the system stores the tag for that family and returns it in subsequent tag lists for members of that family

#### Scenario: Delete tag clears item references
- **WHEN** a member deletes a tag that is attached to one or more items
- **THEN** the system removes the tag from the catalog and clears that tag id from those items so no dangling tag references remain

### Requirement: Default tag seeds
When a family first needs tags and has none, the system MUST ensure a small set of default tags exists (at least: 药品、饮料、工具、衣物). Seeding MUST be idempotent and MUST NOT recreate defaults after the member has deleted them if an explicit “seeded” marker or equivalent already recorded that defaults were applied.

#### Scenario: First open of tag picker seeds defaults
- **WHEN** a member opens tag management or the item tag picker for a family that has never been seeded
- **THEN** the system creates the default tags for that family before showing the list

### Requirement: Multi-tag items on create and edit
Item create and update MUST accept zero or more tag ids that belong to the current family. Invalid or cross-family tag ids MUST be rejected. Detail and ledger views MUST show attached tag names when present.

#### Scenario: Attach tags on edit
- **WHEN** a member saves an item with one or more valid family tag ids
- **THEN** the system persists those tag ids on the item and detail shows the corresponding tag names

#### Scenario: Reject foreign tag id
- **WHEN** a member submits a tag id that does not belong to the current family
- **THEN** the system rejects the write and does not partially apply that tag set

### Requirement: Filter ledger by tag
The item domain list/search API MUST accept an optional tag id and return only current-family items that include that tag. The family ledger UI currently filters by space; a visible tag filter on the ledger is deferred. Clearing a tag filter, when present, MUST restore the unfiltered (or space-only) ledger list.

#### Scenario: API filter by one tag
- **WHEN** a member (or Agent) requests the item list with a tag id for the current family
- **THEN** the system returns only items that include that tag id

#### Scenario: Ledger UI has no tag chips yet
- **WHEN** a member uses only the family ledger UI
- **THEN** they can still attach tags on create/edit and see tag names on detail, without a required tag-filter control on the home list
