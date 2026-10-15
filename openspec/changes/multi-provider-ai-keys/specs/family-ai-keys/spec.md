## REMOVED Requirements

### Requirement: DeepSeek preset only

## ADDED Requirements

### Requirement: Preset platform and model

Adding a key MUST require the secret and MAY accept a display label. The member MUST choose a platform from the server preset catalog, or omit it and receive that catalog's DeepSeek default. The system MUST fill the API base URL and model from the catalog. A client-supplied base URL MUST NOT be stored. The settings UI MUST NOT ask the member to type a base URL or a free-form model id. Selecting a platform MUST preselect that platform's default model so saving does not require a second choice. An unknown platform or model MUST be rejected.

#### Scenario: Paste key for a preset platform

- **WHEN** a member submits a non-empty API key and a catalog platform without a model id
- **THEN** the system stores that platform's default model and catalog base URL

#### Scenario: Client base URL is ignored

- **WHEN** a member submits a catalog platform together with a different base URL
- **THEN** the stored base URL is the catalog value

#### Scenario: Unknown model rejected

- **WHEN** a member submits a model id that is not in the selected platform's catalog
- **THEN** the system rejects the add and does not store the key

### Requirement: Legacy DeepSeek URL still completes

Stored keys whose base URL is exactly the DeepSeek host without a version path MUST still be called at that host's `/v1/chat/completions` endpoint. Catalog entries that already include a version path, including Zhipu `/api/paas/v4`, MUST be called without an extra `/v1` segment.

#### Scenario: Old DeepSeek key keeps working

- **WHEN** assistant act uses a stored key whose base URL is `https://api.deepseek.com`
- **THEN** the request goes to `https://api.deepseek.com/v1/chat/completions`

#### Scenario: Zhipu preset has no extra version segment

- **WHEN** assistant act uses a stored Zhipu preset key
- **THEN** the request path contains `/api/paas/v4/chat/completions` and does not contain `/v4/v1`

## MODIFIED Requirements

### Requirement: Keys also serve assistant act

Stored family keys MUST be usable by the assistant act path. Listing, adding, removing, masking, default selection, and the three-key cap MUST stay as specified for keys. Assist act MUST try the default key first and, on retryable provider failures (timeout, connection failure, 429, or 5xx), retry with one other stored key even when that key is a different platform. A 400 response MUST NOT switch keys. Successful act MUST stop trying further keys. When the tried keys fail with HTTP 401 and none remain, the member MUST be told to check the key settings rather than shown the upstream error body. Quota exhaustion MUST keep the existing quota message.

#### Scenario: Same keys for assistant

- **WHEN** a family has a default stored key and a member runs assistant act
- **THEN** the system uses that family's stored keys to call the model and never returns the full secret to the client

#### Scenario: No keys blocks assistant

- **WHEN** a member starts assistant act and the current family has no keys
- **THEN** the system does not call the model and tells the member to configure a key

#### Scenario: Failover across platforms

- **WHEN** the default key fails with a timeout or HTTP 503 and another stored key for a different platform exists
- **THEN** the system retries the model call once with that next key

#### Scenario: Invalid key without a backup

- **WHEN** the only stored key is rejected with HTTP 401
- **THEN** the member is told to check the key settings
