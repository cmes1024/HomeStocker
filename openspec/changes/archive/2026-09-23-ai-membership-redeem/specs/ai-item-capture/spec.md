## ADDED Requirements

### Requirement: Extraction and transcription require family AI membership
Before calling the speech or extraction model path, `extract` and `transcribe` MUST verify that the caller’s current family has an active AI membership subscription. When the subscription is missing or expired, the system MUST reject the call with a subscription-required error and MUST NOT call the model. Existing key-required and catalog rules still apply after the subscription check passes.

#### Scenario: Capture extract blocked without subscription
- **WHEN** a member runs capture extraction and the current family has no active AI membership
- **THEN** extraction fails with a subscription-required error and no provider call is made

#### Scenario: Capture extract allowed with subscription
- **WHEN** a member runs capture extraction and the current family subscription is active
- **THEN** extraction proceeds to the existing key and model flow
