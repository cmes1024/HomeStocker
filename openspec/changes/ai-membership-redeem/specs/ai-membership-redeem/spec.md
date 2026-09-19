## Purpose

Lets a household unlock AI capture and the text assistant for a limited period by redeeming an off-platform season code bound to the current family, without WeChat in-app payment.

## ADDED Requirements

### Requirement: Family-scoped subscription is the entitlement truth
AI membership MUST belong to a family, not to a single user profile. Any current member of that family MUST be able to use gated AI actions while the family’s subscription `expiresAt` is strictly greater than the server time. Switching to another family MUST evaluate that other family’s subscription independently. Leaving a family MUST NOT move the subscription to the departing member.

#### Scenario: Member uses AI in a subscribed home
- **WHEN** the current family’s subscription has not expired and a member calls a gated AI action
- **THEN** the subscription check allows the action to proceed to its existing business logic

#### Scenario: Other home without subscription is blocked
- **WHEN** a member switches to a family with no active subscription and calls a gated AI action
- **THEN** the system rejects the call with a subscription-required error and does not call the model

#### Scenario: Leaving does not take the subscription
- **WHEN** a non-owner member leaves a subscribed family
- **THEN** the family’s subscription remains for members who stay

### Requirement: Redeem binds unused code to current family
Redeeming MUST require the caller to have a current family membership. The system MUST normalize the submitted code, look up the code by hash, and accept only `unused` status. On success the system MUST mark the code `used` with family id, openid, and used-at, and MUST create or extend `familySubscriptions` for that family. Extension MUST set `expiresAt` to max(existing expiresAt, now) plus the product’s day count. Concurrent double-redeem of the same code MUST leave only one successful redemption.

#### Scenario: First redeem opens a season
- **WHEN** a member of the current family redeems a valid unused season code
- **THEN** that family’s subscription becomes active with an expiry about ninety days from redeem time for product `ai_season_90d`

#### Scenario: Second redeem extends from remaining time
- **WHEN** a family already has an unexpired subscription and a member redeems another valid unused season code
- **THEN** the new expiry is the previous expiry plus the product days, not now plus days alone

#### Scenario: Used or revoked code rejected
- **WHEN** a member submits a code whose status is `used` or `revoked`
- **THEN** the system rejects redeem and does not change `familySubscriptions`

#### Scenario: No family cannot redeem
- **WHEN** a caller with no current family tries to redeem
- **THEN** the system rejects redeem

### Requirement: Codes stored hashed; plaintext issued only to admin
Stored redeem records MUST use a hash of the normalized plaintext as the document id and MUST NOT persist the plaintext. Issuing codes MUST succeed only when the caller’s OPENID equals the configured admin openid. A successful issue response MAY return plaintext codes once for fulfillment. Non-admin callers MUST be forbidden from issuing codes.

#### Scenario: Admin issues codes
- **WHEN** the configured admin openid requests a batch of season codes
- **THEN** the system stores hashed unused records and returns plaintext codes in the response

#### Scenario: Non-admin cannot issue
- **WHEN** a non-admin member calls issue codes
- **THEN** the system rejects the call and creates no codes

### Requirement: Subscription snapshot for members
Members of the current family MUST be able to read a subscription snapshot that includes whether it is active, `expiresAt` when present, and product id when present. The snapshot MUST be resolved from the server for the current family and MUST NOT trust a client-supplied family id.

#### Scenario: Active snapshot
- **WHEN** a member loads subscription status for a family with `expiresAt` in the future
- **THEN** the snapshot reports active true and that expiry

#### Scenario: Missing or expired snapshot
- **WHEN** a member loads subscription status and there is no document or `expiresAt` is not in the future
- **THEN** the snapshot reports active false

### Requirement: Gated AI actions require active subscription
The actions `extract`, `transcribe`, and `act` MUST refuse to run when the current family has no active subscription. Key list/add/remove/default and media attach MUST NOT require a subscription in this version. Rejection MUST use a stable error code suitable for client copy that points members to redeem a season card.

#### Scenario: Extract blocked without membership
- **WHEN** a member calls extract and the current family subscription is inactive
- **THEN** the system does not call the model and returns a subscription-required error

#### Scenario: Key settings still work without membership
- **WHEN** a member lists or adds family AI keys without an active subscription
- **THEN** those key actions still succeed subject to existing key rules

### Requirement: Dissolve removes family subscription
Dissolving a family MUST delete that family’s `familySubscriptions` document. Used redeem code audit rows MAY remain and MUST NOT be recycled into unused.

#### Scenario: Dissolve clears subscription
- **WHEN** the owner dissolves the family
- **THEN** no familySubscriptions document remains for that family id
