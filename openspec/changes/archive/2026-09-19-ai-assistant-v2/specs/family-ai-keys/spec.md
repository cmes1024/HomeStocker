## ADDED Requirements

### Requirement: Keys also serve assistant act
Stored family keys MUST be usable by the V2 assistant act path as well as capture extraction. Listing, adding, removing, masking, default selection, and the three-key cap MUST stay as specified for capture. Assist act MUST try the default key first and, on the same retryable provider failures as extraction, retry with another stored key.

#### Scenario: Same keys for assistant
- **WHEN** a family has a default DeepSeek key and a member runs assistant act
- **THEN** the system uses that family’s stored keys to call the model and never returns the full secret to the client

#### Scenario: No keys blocks assistant
- **WHEN** a member starts assistant act and the current family has no keys
- **THEN** the system does not call the model and tells the member to configure a key
