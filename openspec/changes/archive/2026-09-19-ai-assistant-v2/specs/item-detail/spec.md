## ADDED Requirements

### Requirement: Detail may open the text assistant with focus
The item detail page MUST provide an entry that opens the V2 natural-language assistant with the current item as focus. Opening the assistant MUST NOT replace the existing edit and delete actions on detail. If the member is not on a current family or the item is missing, the entry MUST NOT run act against another family’s item.

#### Scenario: Open assistant from detail
- **WHEN** a member on item detail taps the assistant control
- **THEN** the assistant opens with that item as the focused context for the current family

#### Scenario: Edit still launches from detail
- **WHEN** a member taps edit on item detail
- **THEN** the system still opens the existing item edit flow
