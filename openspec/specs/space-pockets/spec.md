# space-pockets Specification

## Purpose

Presents each space as a “pocket” of recently added items for a playful browse mode. This is an as-built experimental surface: the page exists in the browse subpackage but currently has no product navigation entry.

## Requirements

### Requirement: Pocket lists recent items per space
When the pockets page is opened for the current family, the system MUST list spaces and, for each space, a short list of that space's items ordered by recency (created or updated). Item rows MUST show a name and a location label, using a generic fallback when location is empty.

#### Scenario: Open pockets with items
- **WHEN** a member opens the pockets page in a family that has spaces with items
- **THEN** each space pocket shows recent items for that space, newest first

#### Scenario: Empty pocket
- **WHEN** a member opens a space pocket that has no items
- **THEN** the system shows an empty state for that pocket and does not invent items

### Requirement: No second inventory
Pockets MUST read the same `items` documents as the family ledger and space detail. Opening a pocket MUST NOT create a parallel stock model.

#### Scenario: Same item as ledger
- **WHEN** an item exists in the family ledger under a space
- **THEN** it can appear in that space's pocket using the same item id

### Requirement: Product entry is currently absent
The pockets page MAY be registered in the browse subpackage. Until a navigation entry is added, other product pages MUST NOT be required to link to it. Cache and routing code MAY still treat the page as a valid route.

#### Scenario: No required entry from family or spaces
- **WHEN** a member uses only family, space list, and space detail
- **THEN** they can complete those flows without opening pockets
