# family-home-surface Specification

## Purpose

Gives the current family a settings surface for invite, tools, appearance, reminders, other homes, and optional AI quota, without turning it into a member-directory or chat product.

## Requirements

### Requirement: Invite code as a shareable key
The family page MUST show the current family's invite code and let a member copy it (and MAY offer a WeChat share). Copying MUST not change membership. The page MUST explain that a family member can join with that code.

#### Scenario: Copy invite code
- **WHEN** a member taps copy on the family invite key
- **THEN** the 6-character invite code is copied and membership is unchanged

### Requirement: Tool grid for household functions
The family page MUST expose entries for browsing spaces, managing tags, opening the message feed, and picking the named theme. Equal-rights members MUST be able to open all of these tools.

#### Scenario: Open spaces from family
- **WHEN** a member taps the spaces tool
- **THEN** the system opens the current family's space list

#### Scenario: Open messages from family
- **WHEN** a member taps the messages tool
- **THEN** the system opens the family message feed for the current family

### Requirement: Family reminder master switch
The family page MUST show the household expiry-reminder master switch and persist it through the family domain write API. Toggling it MUST NOT by itself subscribe any member to a specific item.

#### Scenario: Turn master reminder off
- **WHEN** a member turns off the family reminder switch
- **THEN** the family document records the master switch as off

### Requirement: List and switch homes
The family page MUST list families the caller belongs to, mark the current one, and allow switching, creating another family, or joining another by invite code.

#### Scenario: Switch from the home list
- **WHEN** a member taps a non-current family in「我加入的家庭」
- **THEN** that family becomes `currentFamilyId`

### Requirement: Optional AI quota entry
The family page MAY show a single row that opens family AI key settings. That row MUST NOT appear on ledger, edit, or detail as a required control (ledger uses a capture FAB instead).

#### Scenario: Open AI keys from family
- **WHEN** a member taps the AI quota row
- **THEN** the system opens the family AI key settings in the AI subpackage

### Requirement: Text assistant entry on the family page
The family page MUST expose a control that opens the V2 natural-language assistant for the current family. That control MUST NOT replace the AI quota row or the ledger photo-capture FAB. Equal-rights members MUST be able to open it.

#### Scenario: Open assistant from family
- **WHEN** a member taps the text assistant control on the family page
- **THEN** the system opens the V2 assistant for the current family

#### Scenario: Quota row still opens keys
- **WHEN** a member taps the AI quota row
- **THEN** the system still opens the family AI key settings in the capture subpackage
