# item-list-browse Specification

## Purpose

Makes the family-wide ledger the daily home: household summary, optional expiry banner, space-filtered tiles, and a capture shortcut. Name search is an API capability; the visible search chrome is not yet an input.

## Requirements

### Requirement: Ledger is the home after onboarding
Members with a current family MUST land on the family-wide item list as the default daily surface. The header area MUST show the current family name and counts for members, items, and spaces, plus an entry to the family page and a control to add an item.

#### Scenario: Open ledger with a family
- **WHEN** a member with a current family opens the app
- **THEN** they see the family-wide item tiles (or an empty state) rather than a separate dashboard home

### Requirement: Space filter on the ledger
The ledger MUST let the member pick a space and list only that space's items. Picking the same space again MUST not be required to no-op successfully. Space filter MUST NOT invent a second inventory.

#### Scenario: Filter to kitchen
- **WHEN** a member selects space「厨房」on the ledger
- **THEN** only items with that `spaceId` are listed

### Requirement: Expiry banner is a single highlight
When the family has at least one expiring or expired item, the ledger MAY show one banner for the soonest such item, including a place phrase when space/location names are available. Tapping the banner MAY open the family message feed. The banner MUST NOT replace the dedicated expiring-items query.

#### Scenario: Banner for an expiring item
- **WHEN** the current family has an item whose expire date is today or within the documented near window
- **THEN** the ledger shows a banner naming that item (and place when known)

### Requirement: Search chrome is not yet interactive
The ledger MAY render a search placeholder in the navigation bar. Until search UI is implemented, tapping that placeholder MUST NOT be required to run `item.search`. Keyword search remains available on the item domain API for Agent and a later UI.

#### Scenario: Placeholder does not navigate
- **WHEN** a member looks at the ledger search placeholder
- **THEN** the page still lists items by the current space filter and does not open a search results page

### Requirement: Tiles open detail
Each item tile MUST show name and quantity (unit and expiry badges when present). Tapping a tile MUST open item detail, not the editor.

#### Scenario: Tap tile
- **WHEN** a member taps an item tile
- **THEN** item detail for that id opens
