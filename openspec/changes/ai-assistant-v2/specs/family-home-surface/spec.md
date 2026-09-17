## ADDED Requirements

### Requirement: Text assistant entry on the family page
The family page MUST expose a control that opens the V2 natural-language assistant for the current family. That control MUST NOT replace the AI quota row or the ledger photo-capture FAB. Equal-rights members MUST be able to open it.

#### Scenario: Open assistant from family
- **WHEN** a member taps the text assistant control on the family page
- **THEN** the system opens the V2 assistant for the current family

#### Scenario: Quota row still opens keys
- **WHEN** a member taps the AI quota row
- **THEN** the system still opens the family AI key settings in the capture subpackage
