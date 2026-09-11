## Purpose

Let members open an item from the family ledger to review full details, then edit or delete from that detail surface instead of jumping straight into the editor.

## ADDED Requirements

### Requirement: Ledger opens item detail on tap
The item list page MUST navigate to the item detail page when a member taps an item row or tile. The list MUST NOT open the edit page on a simple tap.

#### Scenario: Tap item on ledger
- **WHEN** a member taps an item on the family ledger
- **THEN** the system opens the item detail page for that item

### Requirement: Detail shows current item fields
The item detail page MUST show the item's name, quantity (and unit when present), space, location when set, and note when set. The detail page MUST provide clear entry points to edit and to delete the item.

#### Scenario: View detail
- **WHEN** a member opens detail for an existing item
- **THEN** the system shows name, quantity/unit, space, optional location, and optional note, plus edit and delete actions

### Requirement: Edit and delete only from detail
Editing MUST continue through the existing item edit flow launched from detail. Deleting MUST require confirmation, call the existing item remove write path, and return the member to the ledger on success. The ledger MUST NOT offer long-press delete.

#### Scenario: Delete from detail
- **WHEN** a member confirms delete on the detail page
- **THEN** the system removes the item via the item domain write API and returns to the ledger

#### Scenario: No long-press delete on ledger
- **WHEN** a member long-presses an item on the ledger
- **THEN** the system does not present or perform delete from that gesture
