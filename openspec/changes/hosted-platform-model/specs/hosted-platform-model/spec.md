## Purpose

Gives a family an optional, time-limited platform model that any member can select, while the operator keeps the shared provider keys and the family can keep using its own keys after the grant ends.

## ADDED Requirements

### Requirement: Hosted model has its own expiry
The system MUST store a hosted-model expiry separately from the capacity expiry. A grant MUST extend that expiry with max(existing hosted-model expiry, now) plus the granting code’s days. A capacity redeem that does not grant the hosted model MUST leave the hosted-model expiry unchanged. An expired hosted model MUST NOT change capacity limits.

#### Scenario: Grant extends a still-valid hosted model
- **WHEN** a family whose hosted model expires in the future redeems a code that grants the hosted model
- **THEN** the new hosted-model expiry is the previous hosted-model expiry plus that code’s days

#### Scenario: Capacity-only redeem leaves the hosted clock
- **WHEN** a family with a future hosted-model expiry redeems a code that does not grant the hosted model
- **THEN** the hosted-model expiry is unchanged and the capacity expiry still extends

#### Scenario: Hosted expiry does not drop capacity
- **WHEN** the hosted-model expiry is in the past and the capacity subscription is still active
- **THEN** capacity limits stay on the capacity plan

### Requirement: Admin manages the shared platform pool
The system MUST let the configured capacity admin list, add, reorder, disable, and delete shared platform keys. Callers who are not that admin MUST be denied. Each key MUST use a platform and model from the server preset catalog. A client-supplied base URL MUST NOT be stored. The list shown to the admin MUST omit the full secret and MUST show only a mask. Disabled keys MUST stay listed and MUST NOT be used for calls. The pool MUST hold at most eight keys.

#### Scenario: Admin adds a catalog key
- **WHEN** the admin submits a catalog platform, a catalog model, and a non-empty secret
- **THEN** the key is stored enabled, the response mask is not the full secret, and the base URL is the catalog value

#### Scenario: Non-admin cannot manage the pool
- **WHEN** a member who is not the configured admin lists or changes platform keys
- **THEN** the system denies the request

#### Scenario: Disabled key is skipped
- **WHEN** the admin disables a platform key and a family then calls the assistant with the hosted model selected
- **THEN** that key is not used

### Requirement: Key settings show the hosted model and its expiry
When the current family has a hosted-model expiry, key settings MUST show one hosted-model row above the family’s own keys. While the expiry is in the future, the row MUST show the expiry date and MUST be selectable as the default. After the expiry, the row MUST remain, MUST show that it ended on that date, and MUST NOT be selectable as the default. The row MUST NOT show a secret mask and MUST NOT offer delete. A family with no hosted-model expiry MUST NOT see the row.

#### Scenario: Active row shows the expiry and can be selected
- **WHEN** a member opens key settings and the hosted model expires on a future date
- **THEN** the row shows that date and can be set as the default

#### Scenario: Expired row cannot be selected
- **WHEN** a member opens key settings and the hosted-model expiry is in the past
- **THEN** the row shows the ended date and setting it as the default is rejected

### Requirement: One selected source per request
Assistant act MUST call either the family’s stored keys or the platform pool, not both, in one request. The selected source MUST be the hosted model only when it is active and it is the family’s chosen default, or when it is active and the family has no stored keys. Otherwise the selected source MUST be the family’s stored keys. Choosing a stored key as default MUST keep the hosted-model row visible while it is active. If the hosted model was the default and has expired, and the family still has stored keys, the effective default MUST become the stored default key.

#### Scenario: Own default does not spend the platform pool
- **WHEN** the hosted model is active and the member has set a stored key as the default
- **THEN** assistant act uses the stored keys and does not call the platform pool

#### Scenario: Hosted default uses only the platform pool
- **WHEN** the hosted model is active and is the default
- **THEN** assistant act uses the platform pool and does not call the family’s stored keys in that request

#### Scenario: Expiry returns the default to a stored key
- **WHEN** the hosted model was the default, its expiry has passed, and the family has stored keys
- **THEN** assistant act uses the stored default key

### Requirement: Platform pool fails over within one request
When the selected source is the hosted model, assistant act MUST try enabled platform keys in list order, skipping keys in cooldown, and MUST try at most two keys. Timeout, connection failure, HTTP 401, HTTP 429, HTTP 5xx, and quota exhaustion MUST switch to the next key and put the failed key in cooldown. A response that is not a valid plan MUST be repaired on the same key and MUST NOT switch keys because of that. If both attempts fail, the member MUST be told the assistant is temporarily unavailable, not told to check key settings. The success response MUST NOT say that a different platform key was used.

#### Scenario: Quota on the first key tries the next
- **WHEN** the hosted model is selected, the first enabled key reports quota exhaustion, and another enabled key exists
- **THEN** the system retries once with the next key and later requests skip the exhausted key until its cooldown ends

#### Scenario: Both platform attempts fail
- **WHEN** the hosted model is selected and both attempted platform keys fail
- **THEN** the member is told the assistant is temporarily unavailable
