# family-ai-keys Specification

## Purpose

Lets a family store shared DeepSeek API credentials so any member can run AI capture against that household’s quota without each person pasting a personal key on device.

## Requirements

### Requirement: Family-scoped keys with membership
AI provider keys MUST belong to a family, not to a single user profile. Only current members of that family MAY list, add, remove, or set the default key. The server MUST resolve the family from the caller’s current family membership and MUST NOT trust a client-supplied family id for these operations.

#### Scenario: Member lists keys for current home
- **WHEN** a member of the current family opens AI key settings
- **THEN** the system shows that family’s keys only

#### Scenario: Other family cannot see the keys
- **WHEN** a member switches to another family
- **THEN** key settings show the newly selected family’s keys, not the previous family’s

### Requirement: DeepSeek preset only
Adding a key MUST require the secret and MAY accept a display label. The system MUST fill provider, API base URL, and model for DeepSeek internally. The settings UI MUST NOT ask the member for a base URL or model name in this version.

#### Scenario: Paste key only
- **WHEN** a member submits a non-empty API key for the current family
- **THEN** the system stores a DeepSeek preset record for that family that can be used for extraction

### Requirement: Masked list never exposes the secret
Any client-visible key list MUST omit the full secret and MUST show only a hint such as the last few characters. The full secret MUST be readable only by the trusted server-side extraction path.

#### Scenario: List response has no full secret
- **WHEN** a member loads the family key list
- **THEN** the payload contains a hint and metadata but not the complete API key

### Requirement: Default key and failover
A family MUST have at most one default key. The first stored key MUST become default. Extraction MUST try the default key first and, on provider authentication, quota, rate-limit, or timeout failure, retry the same request with another stored key. Successful extraction MUST stop trying further keys.

#### Scenario: First key is default
- **WHEN** a family with no keys adds its first key
- **THEN** that key is the default for extraction

#### Scenario: Failover to the next key
- **WHEN** extraction fails with the default key for a retryable provider error and another key exists
- **THEN** the system retries extraction with the next key and returns drafts if that key succeeds

#### Scenario: No keys blocks extraction
- **WHEN** a member starts extraction and the current family has no keys
- **THEN** the system does not call the model and tells the member to configure a key

### Requirement: Cap and equal rights
A family MUST NOT store more than three keys. Any member MAY add or delete keys (same equal-rights model as other family settings). Deleting the default when others remain MUST assign a new default from the remaining keys.

#### Scenario: Fourth key rejected
- **WHEN** a member tries to add a fourth key
- **THEN** the system rejects the add and leaves the existing three unchanged

#### Scenario: Remaining members keep keys after one leaves
- **WHEN** a non-owner member leaves the family
- **THEN** the family’s keys remain available to members who stay

### Requirement: Dissolve removes secrets
Dissolving a family MUST delete that family’s stored AI keys so they are not left attached to a removed household.

#### Scenario: Dissolve deletes keys
- **WHEN** the owner dissolves the family
- **THEN** no AI keys remain for that family id

### Requirement: Keys also serve assistant act
Stored family keys MUST be usable by the V2 assistant act path as well as capture extraction. Listing, adding, removing, masking, default selection, and the three-key cap MUST stay as specified for capture. Assist act MUST try the default key first and, on the same retryable provider failures as extraction, retry with another stored key.

#### Scenario: Same keys for assistant
- **WHEN** a family has a default DeepSeek key and a member runs assistant act
- **THEN** the system uses that family’s stored keys to call the model and never returns the full secret to the client

#### Scenario: No keys blocks assistant
- **WHEN** a member starts assistant act and the current family has no keys
- **THEN** the system does not call the model and tells the member to configure a key
