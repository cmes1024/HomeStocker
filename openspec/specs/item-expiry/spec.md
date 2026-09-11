# item-expiry Specification

## Purpose

Adds optional production and expiry dates on items so members can see what is expiring or already expired without requiring every item to carry shelf-life data.

## Requirements

### Requirement: Optional shelf-life fields
Item create and update MUST accept optional `productionDate` and `expireDate` as calendar dates (or null/empty to clear). Neither field MUST be required to save an item. When only `productionDate` is set without `expireDate`, the item MUST NOT be treated as expiring or expired for shelf-life displays.

#### Scenario: Save item without dates
- **WHEN** a member saves an item with no production or expiry date
- **THEN** the system accepts the write and treats the item as having no shelf-life status

#### Scenario: Set and clear expire date
- **WHEN** a member sets an expire date then later clears it
- **THEN** the system stores then removes the expire date and shelf-life status returns to none

### Requirement: Derive shelf-life status from expire date
When an item has an `expireDate`, the system MUST classify it relative to the viewer's local calendar day as one of: `expired` (expire date before today), `expiring` (expire date within the next 3 days inclusive of today through today+3), or `normal` (expire date after that window). Classification MUST be derived for display and listing filters; the system MUST NOT require a separately persisted status enum for correctness.

#### Scenario: Item expires today
- **WHEN** an item's expire date is today
- **THEN** the system classifies it as expiring (not normal)

#### Scenario: Item expired yesterday
- **WHEN** an item's expire date is before today
- **THEN** the system classifies it as expired

### Requirement: Show dates and status on detail and ledger
Item detail MUST show production date and expire date when set, and MUST show the derived shelf-life status when an expire date is set. The family ledger MUST visually distinguish expiring and expired items that have an expire date (for example via badge or secondary text).

#### Scenario: Detail with expire date
- **WHEN** a member opens detail for an item with an expire date in the expiring window
- **THEN** the system shows the expire date and an expiring status indicator
