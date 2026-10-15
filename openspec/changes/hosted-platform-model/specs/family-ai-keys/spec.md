## ADDED Requirements

### Requirement: Hosted model entry is not a stored key
The hosted-model row MUST NOT count toward the three stored keys. Deleting a stored key MUST NOT remove the hosted-model row. Dissolving a family MUST NOT delete the shared platform pool.

#### Scenario: Fourth stored key still rejected
- **WHEN** a family already has three stored keys and the hosted-model row is visible
- **THEN** adding another stored key is rejected and the three stored keys remain

#### Scenario: Dissolve keeps the platform pool
- **WHEN** the owner dissolves a family that had a hosted-model expiry
- **THEN** that family’s stored keys are gone and the shared platform keys remain

## MODIFIED Requirements

### Requirement: Family-scoped keys with membership
AI provider keys MUST belong to a family, not to a single user profile. Only current members of that family MAY list, add, remove, or set the default key. The server MUST resolve the family from the caller’s current family membership and MUST NOT trust a client-supplied family id for these operations. When the current family has a hosted-model expiry, the key list MUST include that family’s hosted-model entry in addition to its stored keys.

#### Scenario: Member lists keys for current home
- **WHEN** a member of the current family opens AI key settings
- **THEN** the system shows that family’s stored keys, and the hosted-model entry when this family has a hosted-model expiry

#### Scenario: Other family cannot see the keys
- **WHEN** a member switches to another family
- **THEN** key settings show the newly selected family’s stored keys and that family’s hosted-model entry, not the previous family’s stored keys

### Requirement: Keys also serve assistant act
Stored family keys MUST be usable by the assistant act path. Listing, adding, removing, masking, default selection, and the three-key cap MUST stay as specified for stored keys. When the selected source is stored keys, assist act MUST try the default stored key first and, on retryable provider failures (timeout, connection failure, 429, or 5xx), retry with one other stored key even when that key is a different platform. A 400 response MUST NOT switch stored keys. Quota exhaustion on a stored key MUST keep the existing quota message and MUST NOT switch stored keys. When the selected source is the active hosted model, assist act MUST use the platform pool instead of stored keys. When the family has no stored keys and the hosted model is not active, assist act MUST NOT call the model and MUST tell the member to configure a key.

#### Scenario: Same keys for assistant
- **WHEN** a family has a default stored key selected and a member runs assistant act
- **THEN** the system uses that family’s stored keys to call the model and never returns the full secret to the client

#### Scenario: No keys blocks assistant
- **WHEN** a member starts assistant act and the current family has no stored keys and no active hosted model
- **THEN** the system does not call the model and tells the member to configure a key

#### Scenario: Active hosted model runs without stored keys
- **WHEN** a member starts assistant act, the family has no stored keys, and the hosted model is active
- **THEN** the system calls the model with the platform pool

#### Scenario: Failover across platforms
- **WHEN** the selected source is stored keys, the default key fails with a timeout or HTTP 503, and another stored key for a different platform exists
- **THEN** the system retries the model call once with that next stored key

#### Scenario: Invalid key without a backup
- **WHEN** the only stored key is selected and is rejected with HTTP 401
- **THEN** the member is told to check the key settings
