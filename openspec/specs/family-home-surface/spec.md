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

### Requirement: Family reminder settings entry
The family page MUST present the household expiry-reminder settings as a single tappable button in the key card whose label reflects the saved state (for example "临期提醒·上午9点" when on with send time 09:00, "临期提醒关闭" when off). Tapping it MUST open a settings panel containing the master switch, a single-choice reminder lead time, and a send time; the panel MUST persist all three in one save through the family domain write API. Changing these settings MUST NOT by itself subscribe any member to a specific item.

#### Scenario: Turn master reminder off
- **WHEN** a member turns off the family reminder switch in the panel and saves
- **THEN** the family document records the master switch as off, the button label reflects the off state, and the lead time and send time are preserved

#### Scenario: Change send time
- **WHEN** a member picks 09:07 and saves while reminders are on
- **THEN** the family document records hour 9 and minute 7, and the button label shows the new send time

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

### Requirement: Capacity membership entry on the family page
The family page MUST expose a control for the current family’s capacity membership (加强版) status and redeem flow. The control MUST show inactive vs expiry when active, and SHOULD show item count versus effective item limit when a finite limit applies. It MAY also show member count versus effective member limit. Tapping it MUST let any equal-rights member submit a redeem code for the current family. Copy MUST describe closed-beta / invite redeem and MUST NOT instruct users to purchase on an external marketplace. This control MUST NOT replace the AI quota (keys) row or the text assistant entry.

#### Scenario: Show inactive capacity membership
- **WHEN** a member opens the family page and the current family has no active capacity subscription
- **THEN** the membership row indicates the strengthened plan is not active and reflects free limits (including the free item limit against item count when shown)

#### Scenario: Redeem from family page
- **WHEN** a member submits a valid unused capacity redeem code from the family page control
- **THEN** the system activates or extends the current family’s capacity subscription and shows the new expiry
