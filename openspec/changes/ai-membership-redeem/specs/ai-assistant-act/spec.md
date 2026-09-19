## ADDED Requirements

### Requirement: Act requires family AI membership
Before planning or calling the model, `act` MUST verify that the caller’s current family has an active AI membership subscription. When the subscription is missing or expired, the system MUST reject the call with a subscription-required error and MUST NOT call the model or execute inventory tools.

#### Scenario: Assist act blocked without subscription
- **WHEN** a member sends an assistant message and the current family has no active AI membership
- **THEN** act fails with a subscription-required error and no model or tool side effects occur

#### Scenario: Assist act allowed with subscription
- **WHEN** a member sends an assistant message and the current family subscription is active
- **THEN** act proceeds to the existing agent runtime flow
