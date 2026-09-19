## ADDED Requirements

### Requirement: AI membership redeem entry on the family page
The family page MUST expose a control for the current family’s AI membership status and redeem flow. The control MUST show whether membership is inactive or an expiry date when active. Tapping it MUST let any equal-rights member submit a redeem code for the current family. This control MUST NOT replace the AI quota (keys) row or the text assistant entry.

#### Scenario: Show inactive membership
- **WHEN** a member opens the family page and the current family has no active AI membership
- **THEN** the membership row indicates membership is not active

#### Scenario: Redeem from family page
- **WHEN** a member submits a valid unused redeem code from the family page membership control
- **THEN** the system activates or extends the current family’s subscription and shows the new expiry
