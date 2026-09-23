## ADDED Requirements

### Requirement: Capacity membership entry on the family page
The family page MUST expose a control for the current family’s capacity membership (加强版) status and redeem flow. The control MUST show inactive vs expiry when active, and SHOULD show item count versus effective item limit when a finite limit applies. It MAY also show member count versus effective member limit. Tapping it MUST let any equal-rights member submit a redeem code for the current family. Copy MUST describe closed-beta / invite redeem and MUST NOT instruct users to purchase on an external marketplace. This control MUST NOT replace the AI quota (keys) row or the text assistant entry.

#### Scenario: Show inactive capacity membership
- **WHEN** a member opens the family page and the current family has no active capacity subscription
- **THEN** the membership row indicates the strengthened plan is not active and reflects free limits (including the free item limit against item count when shown)

#### Scenario: Redeem from family page
- **WHEN** a member submits a valid unused capacity redeem code from the family page control
- **THEN** the system activates or extends the current family’s capacity subscription and shows the new expiry
